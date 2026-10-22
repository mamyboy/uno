import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { EV, schemas, type Ack, type Card, type SyncPayload } from '@cma/shared';
import { GameError } from '../engine/GameEngine';
import type { RoomManager, ServerMember, ServerRoom } from '../rooms/RoomManager';
import type { Persistence } from '../db/persistence';

interface SocketData {
  code?: string;
  playerId?: string;
  watching?: string;
  rateWindowStart?: number;
  rateWindowCount?: number;
}

const roomCh = (code: string) => `room:${code}`;
const playerCh = (id: string) => `player:${id}`;
const RATE_WINDOW_MS = 1000;
const RATE_LIMIT_PER_WINDOW = 200; // generous cap per socket per second; blocks spam, not normal play
/** Grace period before a dropped connection actually removes the player — long enough to survive
 * a phone's "switch app briefly" background-throttling (iOS/Android suspend background tabs'
 * WebSockets, which fires a normal socket.io 'disconnect'), short enough that an abandoned seat
 * doesn't linger. Reconnecting with the same nickname/session within this window cancels the kick. */
const DISCONNECT_GRACE_MS = 18_000;

const sd = (s: Socket) => s.data as SocketData;

function errMessage(err: unknown): string {
  if (err instanceof z.ZodError) return err.errors[0]?.message ?? 'INVALID_INPUT';
  if (err instanceof GameError) return err.message;
  if (err instanceof Error) return err.message;
  return 'UNKNOWN_ERROR';
}

export function registerSocketHandlers(io: Server, rooms: RoomManager, db: Persistence, graceMs = DISCONNECT_GRACE_MS) {
  // key: `${roomCode}:${playerId}` — pending "kick after grace period" timers for dropped sockets.
  const pendingKicks = new Map<string, ReturnType<typeof setTimeout>>();
  const kickKey = (code: string, playerId: string) => `${code}:${playerId}`;
  const cancelPendingKick = (code: string, playerId: string) => {
    const key = kickKey(code, playerId);
    const t = pendingKicks.get(key);
    if (t) {
      clearTimeout(t);
      pendingKicks.delete(key);
    }
  };

  const buildSync = (room: ServerRoom, member: ServerMember | null): SyncPayload => ({
    room: rooms.toPublicRoom(room),
    game: room.engine?.getPublicState() ?? null,
    me: member ? { playerId: member.id } : null,
    hand: member && room.engine?.isInGame(member.id) ? room.engine.getPrivateHand(member.id) : null,
    result: room.lastResult,
  });

  const finishIfOver = (room: ServerRoom) => {
    const engine = room.engine;
    if (!engine || engine.status !== 'FINISHED' || room.status === 'FINISHED') return;
    room.status = 'FINISHED';
    const names = new Map(room.members.map((m) => [m.id, m.nickname] as const));
    room.lastResult = engine.getResult(names);
    rooms.recordMatchResult(room, room.lastResult);
    io.to(roomCh(room.code)).emit(EV.GAME_GAME_OVER, room.lastResult);
    io.to(roomCh(room.code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(room));
    void db.saveMatch(room, room.lastResult);
    if (room.isStatic) {
      // Static rooms are walk-up tables — drop straight back into a fresh waiting lobby so
      // anyone still at the table (or anyone who just joined) can start the next round at once.
      room.status = 'WAITING';
      room.engine = null;
      io.to(roomCh(room.code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(room));
    }
  };

  const emitRoom = (room: ServerRoom) => {
    io.to(roomCh(room.code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(room));
    const engine = room.engine;
    if (!engine) return;
    io.to(roomCh(room.code)).emit(EV.GAME_STATE, engine.getPublicState());
    for (const pid of engine.players) {
      io.to(playerCh(pid)).emit(EV.GAME_HAND_UPDATED, engine.getPrivateHand(pid));
    }
    finishIfOver(room);
  };

  function withRoom(socket: Socket): ServerRoom {
    const code = sd(socket).code;
    if (!code) throw new GameError('NOT_IN_ROOM');
    return rooms.get(code);
  }

  /** Like withRoom, but also accepts board-viewer sockets (joined via ROOM_WATCH) — used for
   * the soundboard so the big-screen display can trigger clips too, not just seated players. */
  function withRoomOrWatch(socket: Socket): ServerRoom {
    const code = sd(socket).code ?? sd(socket).watching;
    if (!code) throw new GameError('NOT_IN_ROOM');
    return rooms.get(code);
  }

  function handle<T>(socket: Socket, cb: (ack: Ack<T>) => void, fn: () => T | void) {
    const now = Date.now();
    const windowStart = sd(socket).rateWindowStart ?? 0;
    if (now - windowStart > RATE_WINDOW_MS) {
      sd(socket).rateWindowStart = now;
      sd(socket).rateWindowCount = 0;
    }
    sd(socket).rateWindowCount = (sd(socket).rateWindowCount ?? 0) + 1;
    if ((sd(socket).rateWindowCount ?? 0) > RATE_LIMIT_PER_WINDOW) {
      cb({ ok: false, error: 'RATE_LIMITED' });
      return;
    }
    try {
      const data = fn();
      cb({ ok: true, ...(data as object) } as Ack<T>);
    } catch (err) {
      cb({ ok: false, error: errMessage(err) });
    }
  }

  io.on('connection', (socket) => {
    sd(socket).rateWindowStart = Date.now();
    sd(socket).rateWindowCount = 0;

    socket.on(EV.ROOM_CREATE, (data: unknown, cb: (ack: Ack<any>) => void) => {
      handle(socket, cb, () => {
        const parsed = schemas.createRoom.parse(data);
        const { room, member } = rooms.createRoom(parsed);
        sd(socket).code = room.code;
        sd(socket).playerId = member.id;
        socket.join(roomCh(room.code));
        socket.join(playerCh(member.id));
        rooms.setConnected(room, member.id, true, socket.id);
        cancelPendingKick(room.code, member.id);
        void db.roomCreated(room);
        return { snapshot: buildSync(room, member), sessionToken: member.sessionToken, playerId: member.id, code: room.code };
      });
    });

    socket.on(EV.ROOM_JOIN, (data: unknown, cb: (ack: Ack<any>) => void) => {
      handle(socket, cb, () => {
        const parsed = schemas.joinRoom.parse(data);
        const joined = rooms.joinRoom(parsed.code, parsed.nickname, parsed.sessionToken);
        const { room, member, rejoined } = joined;
        // Same-name takeover from another socket: tell the old one it's been replaced.
        const prev = 'previousSocketId' in joined ? joined.previousSocketId : null;
        if (prev && prev !== socket.id) {
          io.to(prev).emit(EV.SESSION_REPLACED, {});
          const old = io.sockets.sockets.get(prev);
          old?.leave(roomCh(room.code));
          old?.leave(playerCh(member.id));
          if (old) { sd(old).code = undefined; sd(old).playerId = undefined; }
        }
        sd(socket).code = room.code;
        sd(socket).playerId = member.id;
        socket.join(roomCh(room.code));
        socket.join(playerCh(member.id));
        rooms.setConnected(room, member.id, true, socket.id);
        cancelPendingKick(room.code, member.id);
        if (rejoined) {
          io.to(roomCh(room.code)).emit(EV.PLAYER_RECONNECTED, { playerId: member.id });
        } else {
          io.to(roomCh(room.code)).emit(EV.ROOM_PLAYER_JOINED, rooms.toPublicRoom(room));
        }
        emitRoom(room);
        return { snapshot: buildSync(room, member), sessionToken: member.sessionToken, playerId: member.id, code: room.code };
      });
    });

    socket.on(EV.ROOM_WATCH, (data: unknown, cb: (ack: Ack<any>) => void) => {
      handle(socket, cb, () => {
        const parsed = schemas.watch.parse(data);
        const room = rooms.get(parsed.code);
        sd(socket).watching = room.code;
        socket.join(roomCh(room.code));
        return { snapshot: buildSync(room, null) };
      });
    });

    socket.on(EV.ROOM_LEAVE, (_data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        const playerId = sd(socket).playerId ?? '';
        const member = rooms.removeMember(room, playerId);
        socket.leave(roomCh(room.code));
        socket.leave(playerCh(playerId));
        sd(socket).code = undefined;
        sd(socket).playerId = undefined;
        if (member && rooms.find(room.code)) {
          io.to(roomCh(room.code)).emit(EV.ROOM_PLAYER_LEFT, rooms.toPublicRoom(room));
          emitRoom(room);
        }
      });
    });

    socket.on(EV.ROOM_REORDER, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        const parsed = schemas.reorder.parse(data);
        rooms.reorder(room, sd(socket).playerId ?? '', parsed.playerIds);
        emitRoom(room);
      });
    });

    socket.on(EV.ROOM_KICK, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        rooms.assertHost(room, sd(socket).playerId ?? '');
        const parsed = schemas.kick.parse(data);
        const target = rooms.getMember(room, parsed.playerId);
        const member = rooms.removeMember(room, parsed.playerId);
        if (member && target?.socketId) {
          io.to(target.socketId).emit(EV.ROOM_KICKED, { reason: 'KICKED' });
          const targetSocket = io.sockets.sockets.get(target.socketId);
          targetSocket?.leave(roomCh(room.code));
          targetSocket?.leave(playerCh(parsed.playerId));
        }
        if (rooms.find(room.code)) emitRoom(room);
      });
    });

    socket.on(EV.ROOM_CLEAR, (_data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        const code = room.code;
        const requesterId = sd(socket).playerId ?? '';
        const kicked = rooms.clearRoom(room, requesterId);
        for (const { playerId, socketId } of kicked) {
          if (!socketId) continue;
          io.to(socketId).emit(EV.ROOM_KICKED, { reason: 'ROOM_CLEARED' });
          const targetSocket = io.sockets.sockets.get(socketId);
          targetSocket?.leave(roomCh(code));
          targetSocket?.leave(playerCh(playerId));
        }
        sd(socket).code = undefined;
        sd(socket).playerId = undefined;
        const stillExists = rooms.find(code);
        if (stillExists) io.to(roomCh(code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(stillExists));
      });
    });

    socket.on(EV.ROOM_SET_HOST_PLAYS, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        const parsed = schemas.setHostPlays.parse(data);
        rooms.setHostPlays(room, sd(socket).playerId ?? '', parsed.hostPlays);
        emitRoom(room);
      });
    });

    // Lets the room-LIST/join page clear a static table (TABLE1-4) directly, without first
    // joining it as host — the caller isn't a member of that room at all, just browsing the list.
    socket.on(EV.ROOM_CLEAR_BY_CODE, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const parsed = schemas.clearByCode.parse(data);
        const kicked = rooms.clearStaticRoomByCode(parsed.code);
        for (const { playerId, socketId } of kicked) {
          if (!socketId) continue;
          io.to(socketId).emit(EV.ROOM_KICKED, { reason: 'ROOM_CLEARED' });
          const targetSocket = io.sockets.sockets.get(socketId);
          targetSocket?.leave(roomCh(parsed.code));
          targetSocket?.leave(playerCh(playerId));
          if (targetSocket) { sd(targetSocket).code = undefined; sd(targetSocket).playerId = undefined; }
        }
        const stillExists = rooms.find(parsed.code);
        if (stillExists) io.to(roomCh(parsed.code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(stillExists));
      });
    });

    socket.on(EV.ROOM_CLEAR_LEADERBOARD, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const parsed = schemas.clearByCode.parse(data);
        const room = rooms.clearLeaderboard(parsed.code, sd(socket).playerId);
        io.to(roomCh(room.code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(room));
      });
    });

    socket.on(EV.ROOM_LIST, (_data: unknown, cb: (ack: Ack<{ rooms: ReturnType<RoomManager['listStaticRooms']> }>) => void) => {
      handle(socket, cb, () => ({ rooms: rooms.listStaticRooms() }));
    });

    socket.on(EV.ADMIN_RESET_ALL, (_data: unknown, cb: (ack: Ack<{ cleared: number }>) => void) => {
      handle(socket, cb, () => {
        const count = rooms.size;
        rooms.clearAllRooms();
        io.emit(EV.ROOM_STATE_UPDATED, null); // broadcast reset to all connected clients
        return { cleared: count };
      });
    });

    socket.on(EV.ROOM_SET_AVATAR, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        const parsed = schemas.setAvatar.parse(data);
        rooms.setAvatar(room, sd(socket).playerId ?? '', parsed.avatar);
        emitRoom(room);
      });
    });

    socket.on(EV.ROOM_PLAY_SOUND, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoomOrWatch(socket);
        const parsed = schemas.playSound.parse(data);
        const member = sd(socket).playerId ? rooms.getMember(room, sd(socket).playerId ?? '') : null;
        io.to(roomCh(room.code)).emit(EV.ROOM_PLAY_SOUND, { soundId: parsed.soundId, label: parsed.label, byNickname: member?.nickname ?? 'กระดานกลาง' });
      });
    });

    socket.on(EV.GAME_START, (_data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        rooms.startGame(room, sd(socket).playerId ?? '', false);
        emitRoom(room);
      });
    });

    socket.on(EV.GAME_RESTART, (_data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        rooms.startGame(room, sd(socket).playerId ?? '', true);
        emitRoom(room);
      });
    });

    socket.on(EV.GAME_SELECT_DIRECTION, (data: unknown, cb: (ack: Ack<object>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        if (!room.engine) throw new GameError('GAME_NOT_STARTED');
        const parsed = schemas.selectDirection.parse(data);
        room.engine.selectDirection(sd(socket).playerId ?? '', parsed.direction, parsed.turnNumber);
        emitRoom(room);
      });
    });

    socket.on(EV.GAME_PLAY_CARD, (data: unknown, cb: (ack: Ack<{ card: Card; finished: boolean }>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        if (!room.engine) throw new GameError('GAME_NOT_STARTED');
        const parsed = schemas.playCard.parse(data);
        const result = room.engine.playCard(sd(socket).playerId ?? '', parsed.cardId, parsed.turnNumber, parsed.chosenColor);
        emitRoom(room);
        return result;
      });
    });

    socket.on(EV.GAME_PLAY_CARDS, (data: unknown, cb: (ack: Ack<{ cards: Card[]; finished: boolean }>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        if (!room.engine) throw new GameError('GAME_NOT_STARTED');
        const parsed = schemas.playCards.parse(data);
        const result = room.engine.playCards(sd(socket).playerId ?? '', parsed.cardIds, parsed.turnNumber, parsed.chosenColor);
        emitRoom(room);
        return result;
      });
    });

    socket.on(EV.GAME_DRAW_CARD, (data: unknown, cb: (ack: Ack<{ card: Card | null; skipped: boolean; stolen: boolean }>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        if (!room.engine) throw new GameError('GAME_NOT_STARTED');
        const parsed = schemas.drawCard.parse(data);
        const result = room.engine.drawCard(sd(socket).playerId ?? '', parsed.turnNumber, parsed.drawInsteadOfWild);
        emitRoom(room);
        return result;
      });
    });

    socket.on(EV.GAME_SYNC_STATE, (_data: unknown, cb: (ack: Ack<{ snapshot: SyncPayload }>) => void) => {
      handle(socket, cb, () => {
        const room = withRoom(socket);
        const member = rooms.getMember(room, sd(socket).playerId ?? '');
        return { snapshot: buildSync(room, member) };
      });
    });

    socket.on('disconnect', () => {
      const code = sd(socket).code;
      const playerId = sd(socket).playerId;
      if (!code || !playerId) return;
      const room = rooms.find(code);
      if (!room) return;
      // A dropped connection doesn't kick immediately — phones throttle/suspend a backgrounded
      // tab's WebSocket the moment you switch apps, which looks identical to a real disconnect.
      // Give it a grace period to reconnect (same nickname = same seat, see joinRoom) before
      // actually removing the seat + hand, so a quick app-switch survives but an abandoned one
      // doesn't linger forever.
      const member = rooms.getMember(room, playerId);
      if (member && member.socketId && member.socketId !== socket.id) return; // seat already taken over by a newer socket
      rooms.setConnected(room, playerId, false, null);
      io.to(roomCh(room.code)).emit(EV.PLAYER_DISCONNECTED, { playerId });
      io.to(roomCh(room.code)).emit(EV.ROOM_STATE_UPDATED, rooms.toPublicRoom(room));

      const key = kickKey(room.code, playerId);
      const timer = setTimeout(() => {
        pendingKicks.delete(key);
        const r = rooms.find(room.code);
        if (!r) return;
        const m = rooms.getMember(r, playerId);
        if (!m || m.connected) return; // reconnected (or already gone) in the meantime
        rooms.removeMember(r, playerId);
        if (rooms.find(r.code)) {
          io.to(roomCh(r.code)).emit(EV.ROOM_PLAYER_LEFT, rooms.toPublicRoom(r));
          emitRoom(r);
        }
      }, graceMs);
      pendingKicks.set(key, timer);
    });
  });

  setInterval(() => rooms.sweep(), 60_000);
}