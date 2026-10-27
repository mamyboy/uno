import { createServer } from 'node:http';
import type { Server as HTTPServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../src/rooms/RoomManager';
import { Persistence } from '../src/db/persistence';
import { registerSocketHandlers } from '../src/socket/handlers';

let httpServer: HTTPServer;
let port: number;

function connect(): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const socket = ioc(`http://localhost:${port}`, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
  });
}

function emit<T = any>(socket: ClientSocket, event: string, data: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

let rooms: RoomManager;

beforeAll(async () => {
  httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  rooms = new RoomManager();
  rooms.ensureStaticRooms();
  const db = new Persistence(undefined); // no DB in tests
  registerSocketHandlers(io, rooms, db, 60); // short grace period for fast tests
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
});

afterAll(() => {
  httpServer.close();
});

describe('socket integration', () => {
  it('creates a room and returns a session token', async () => {
    const host = await connect();
    const ack = await emit(host, 'room:create', { name: 'Room A', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    expect(ack.ok).toBe(true);
    expect(ack.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(ack.sessionToken).toBeTruthy();
    host.close();
  });

  it('a duplicate nickname in the same room is treated as the same person (re-claims the seat)', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room B', nickname: 'Alice', maxPlayers: 4, hostPlays: false });
    const join1 = await emit(guest, 'room:join', { code: created.code, nickname: 'ALICE' });
    expect(join1.ok).toBe(true);
    expect(join1.playerId).toBe(created.playerId);
    expect(join1.snapshot.room.players).toHaveLength(1);
    host.close();
    guest.close();
  });

  it('room:taunt is broadcast to everyone in the room, with a per-player cooldown', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Taunt', nickname: 'Tom', hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Jerry' });
    const got = new Promise<any>((resolve) => guest.once('room:taunt', resolve));
    const ack = await emit(host, 'room:taunt', { tauntId: 'laugh', mascot: '🦊' });
    expect(ack.ok).toBe(true);
    const ev = await got;
    expect(ev).toMatchObject({ nickname: 'Tom', mascot: '🦊', tauntId: 'laugh' });
    const again = await emit(host, 'room:taunt', { tauntId: 'cry', mascot: '🦊' });
    expect(again).toMatchObject({ ok: false, error: 'TAUNT_COOLDOWN' });
    const bad = await emit(guest, 'room:taunt', { tauntId: 'nope', mascot: '🦊' });
    expect(bad).toMatchObject({ ok: false, error: 'INVALID_TAUNT' });
    host.disconnect();
    guest.disconnect();
  });

  it('room:voice relays a short clip to the others (not the sender), with cooldown and host on/off', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Voice', nickname: 'Vee', hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Gee' });
    let selfGot = false;
    host.on('room:voice', () => (selfGot = true));
    const got = new Promise<any>((resolve) => guest.once('room:voice', resolve));
    const clip = new Uint8Array(2000).fill(7);
    const ack = await emit(host, 'room:voice', { mime: 'audio/webm;codecs=opus', durationMs: 1500, data: clip });
    expect(ack.ok).toBe(true);
    const ev = await got;
    expect(ev).toMatchObject({ nickname: 'Vee', mime: 'audio/webm;codecs=opus', durationMs: 1500 });
    expect(new Uint8Array(ev.data).length).toBe(2000);
    expect(selfGot).toBe(false);
    expect(await emit(host, 'room:voice', { mime: 'audio/webm', durationMs: 1500, data: clip })).toMatchObject({ ok: false, error: 'VOICE_COOLDOWN' });
    expect(await emit(guest, 'room:voice', { mime: 'audio/webm', durationMs: 1500, data: new Uint8Array(200_000) })).toMatchObject({ ok: false, error: 'VOICE_INVALID' });
    expect(await emit(guest, 'room:voice_toggle', { enabled: false })).toMatchObject({ ok: false, error: 'NOT_HOST' });
    expect((await emit(host, 'room:voice_toggle', { enabled: false })).ok).toBe(true);
    expect(await emit(guest, 'room:voice', { mime: 'audio/webm', durationMs: 1500, data: clip })).toMatchObject({ ok: false, error: 'VOICE_DISABLED' });
    host.disconnect();
    guest.disconnect();
  });

  it('avatars are stored once and travel as short /avatars/ paths; locked during a game', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Pic', nickname: 'Ann', hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Ben' });
    const jpeg = 'data:image/jpeg;base64,' + Buffer.from(new Uint8Array(3000).fill(9)).toString('base64');
    const gotRoom = new Promise<any>((resolve) => guest.once('room:state_updated', resolve));
    expect((await emit(host, 'room:set_avatar', { avatar: jpeg })).ok).toBe(true);
    const r = await gotRoom;
    const ann = r.players.find((p: any) => p.nickname === 'Ann');
    expect(ann.avatar).toMatch(/^\/avatars\/[a-f0-9]{20}\.jpg$/);
    expect(JSON.stringify(r).length).toBeLessThan(3000); // no base64 in the snapshot
    const stored = rooms.getAvatar(ann.avatar.slice('/avatars/'.length));
    expect(stored?.data.length).toBe(3000);
    expect((await emit(host, 'room:set_avatar', { avatar: 'data:text/html;base64,AAAA' })).ok).toBe(false);

    await emit(host, 'game:start', {});
    expect(await emit(guest, 'room:set_avatar', { avatar: jpeg })).toMatchObject({ ok: false, error: 'AVATAR_LOCKED_IN_GAME' });
    host.disconnect();
    guest.disconnect();
  });

  it('a plain move (direction / draw) broadcasts game state but NOT the room snapshot', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Lean', nickname: 'Cat', hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Dog' });
    await emit(host, 'game:start', {});
    await new Promise((r) => setTimeout(r, 50));
    let roomUpdates = 0;
    let gameUpdates = 0;
    guest.on('room:state_updated', () => roomUpdates++);
    guest.on('game:state', () => gameUpdates++);
    const sync = await emit(host, 'game:sync_state', {});
    const g = sync.snapshot.game;
    const first = g.currentPlayerId ?? g.firstPlayerId;
    const firstSock = first === sync.snapshot.me.playerId ? host : guest;
    expect((await emit(firstSock, 'game:select_direction', { direction: 'RIGHT', turnNumber: g.turnNumber })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(gameUpdates).toBeGreaterThan(0);
    expect(roomUpdates).toBe(0);
    expect(g.history.length).toBeLessThanOrEqual(15);
    host.disconnect();
    guest.disconnect();
  });

  it('keeps private hands isolated between players', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room C', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });

    const handUpdates: Record<string, any> = {};
    host.on('game:hand_updated', (h: any) => { handUpdates.host = h; });
    guest.on('game:hand_updated', (h: any) => { handUpdates.guest = h; });

    const startAck = await emit(host, 'game:start', {});
    expect(startAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 100));

    expect(handUpdates.host.hand).toHaveLength(7);
    expect(handUpdates.guest.hand).toHaveLength(7);
    // Ensure the two hands don't share card ids (no leakage of the same card object to both).
    const hostIds = new Set(handUpdates.host.hand.map((c: any) => c.id));
    const guestIds = new Set(handUpdates.guest.hand.map((c: any) => c.id));
    for (const id of hostIds) expect(guestIds.has(id)).toBe(false);

    host.close();
    guest.close();
  });

  it('rejects playing a card when it is not your turn', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room D', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });
    await emit(host, 'game:start', {});

    const sync = await emit(host, 'game:sync_state', {});
    const game = sync.snapshot.game;
    const notCurrentIsHost = game.currentPlayerId !== created.playerId;
    const wrongActor = notCurrentIsHost ? host : guest; // whichever one is NOT current
    const wrongSync = await emit(wrongActor, 'game:sync_state', {});
    const wrongHand = wrongSync.snapshot.hand;

    if (wrongHand && wrongHand.hand.length > 0) {
      const ack = await emit(wrongActor, 'game:play_card', { cardId: wrongHand.hand[0].id, turnNumber: game.turnNumber });
      expect(ack.ok).toBe(false);
    }

    host.close();
    guest.close();
  });

  it('a dropped connection is kicked out only after the grace period expires (survives a brief phone app-switch)', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room E', nickname: 'Host', hostPlays: true });
    const g = await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });
    guest.disconnect();

    // Marked disconnected immediately, but NOT removed yet (grace period is 60ms in this test).
    await new Promise((r) => setTimeout(r, 15));
    let room = rooms.find(created.code)!;
    expect(room.members.map((m) => m.nickname)).toEqual(['Host', 'Guest']);
    expect(room.members.find((m) => m.nickname === 'Guest')?.connected).toBe(false);

    // Reconnecting with the same session token within the grace window cancels the kick.
    const guest2 = await connect();
    const rejoinAck = await emit(guest2, 'room:join', { code: created.code, nickname: 'ignored', sessionToken: g.sessionToken });
    expect(rejoinAck.ok).toBe(true);
    expect(rejoinAck.playerId).toBe(g.playerId);
    await new Promise((r) => setTimeout(r, 80)); // past the original grace window — should NOT be kicked now
    room = rooms.find(created.code)!;
    expect(room.members.map((m) => m.nickname)).toEqual(['Host', 'Guest']);
    guest2.close();

    // A second drop, this time with nobody reconnecting — DOES get kicked once the grace expires.
    const guest3 = await connect();
    const g3 = await emit(guest3, 'room:join', { code: created.code, nickname: 'ignored', sessionToken: g.sessionToken });
    expect(g3.ok).toBe(true);
    guest3.disconnect();
    await new Promise((r) => setTimeout(r, 90));
    room = rooms.find(created.code)!;
    expect(room.members.map((m) => m.nickname)).toEqual(['Host']);

    const guest4 = await connect();
    const stale = await emit(guest4, 'room:join', { code: created.code, nickname: '__rejoin__', sessionToken: g.sessionToken });
    expect(stale.ok).toBe(false);
    expect(stale.error).toBe('SESSION_INVALID');
    const fresh = await emit(guest4, 'room:join', { code: created.code, nickname: 'Guest' });
    expect(fresh.ok).toBe(true);
    host.close();
    guest4.close();
  });

  it('has no player limit; a mid-game joiner waits for the next match, then is dealt in', async () => {
    const sockets = await Promise.all(Array.from({ length: 14 }, () => connect()));
    const created = await emit(sockets[0], 'room:create', { name: 'Big', nickname: 'P0', hostPlays: true });
    for (let i = 1; i < 14; i++) {
      expect((await emit(sockets[i], 'room:join', { code: created.code, nickname: `P${i}` })).ok).toBe(true);
    }
    expect((await emit(sockets[0], 'game:start', {})).ok).toBe(true); // 14 players → engine adds a 2nd deck
    const late = await connect();
    const lateAck = await emit(late, 'room:join', { code: created.code, nickname: 'Late' });
    expect(lateAck.ok).toBe(true);
    let sync = await emit(late, 'game:sync_state', {});
    const meRow = sync.snapshot.room.players.find((p: any) => p.nickname === 'Late');
    expect(meRow.waiting).toBe(true);
    expect(sync.snapshot.hand).toBeNull(); // no cards, not in the turn order
    expect(sync.snapshot.game.seatOrder).not.toContain(meRow.id);
    expect(sync.snapshot.room.players.filter((p: any) => p.waiting)).toHaveLength(1);
    // a waiting player can't act in the running match
    expect((await emit(late, 'game:draw_card', { turnNumber: sync.snapshot.game.turnNumber })).ok).toBe(false);
    // next match: the host restarts → the waiting player is dealt in
    expect((await emit(sockets[0], 'game:restart', {})).ok).toBe(true);
    sync = await emit(late, 'game:sync_state', {});
    expect(sync.snapshot.room.players.find((p: any) => p.nickname === 'Late').waiting).toBe(false);
    expect(sync.snapshot.hand?.hand.length).toBeGreaterThan(0);
    [...sockets, late].forEach((s) => s.close());
  });

  it('game:play_cards rejects a stack with duplicate card ids', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room F', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });
    await emit(host, 'game:start', {});

    const sync = await emit(host, 'game:sync_state', {});
    const game = sync.snapshot.game;
    const currentIsHost = game.currentPlayerId === created.playerId;
    const actor = currentIsHost ? host : guest;
    const actorSync = await emit(actor, 'game:sync_state', {});
    const someCardId = actorSync.snapshot.hand.hand[0].id;

    const ack = await emit(actor, 'game:play_cards', { cardIds: [someCardId, someCardId], turnNumber: game.turnNumber });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('DUPLICATE_CARD_IN_PLAY');

    host.close();
    guest.close();
  });

  it('game:play_cards rejects when it is not the caller\'s turn', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room G', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });
    await emit(host, 'game:start', {});

    const sync = await emit(host, 'game:sync_state', {});
    const game = sync.snapshot.game;
    const firstIsHost = game.firstPlayerId === created.playerId;
    const firstActor = firstIsHost ? host : guest;
    await emit(firstActor, 'game:select_direction', { direction: 'LEFT', turnNumber: game.turnNumber });

    const sync2 = await emit(host, 'game:sync_state', {});
    const game2 = sync2.snapshot.game;
    const notCurrentIsHost = game2.currentPlayerId !== created.playerId;
    const wrongActor = notCurrentIsHost ? host : guest;
    const wrongSync = await emit(wrongActor, 'game:sync_state', {});
    const wrongHand = wrongSync.snapshot.hand;

    if (wrongHand && wrongHand.hand.length >= 2) {
      const ack = await emit(wrongActor, 'game:play_cards', {
        cardIds: [wrongHand.hand[0].id, wrongHand.hand[1].id],
        turnNumber: game2.turnNumber,
      });
      expect(ack.ok).toBe(false);
      expect(ack.error).toBe('NOT_YOUR_TURN');
    }

    host.close();
    guest.close();
  });

  it('auto-resets a static room back to WAITING right after a match finishes, so a new round can start immediately', async () => {
    const host = await connect();
    const guest = await connect();
    const joinHost = await emit(host, 'room:join', { code: 'TABLE1', nickname: 'StaticHost' });
    expect(joinHost.ok).toBe(true);
    const joinGuest = await emit(guest, 'room:join', { code: 'TABLE1', nickname: 'StaticGuest' });
    expect(joinGuest.ok).toBe(true);

    let over: any = null;
    host.on('game:game_over', (res: any) => { over = res; });

    const startAck = await emit(host, 'game:start', {});
    expect(startAck.ok).toBe(true);

    const sockets: Record<string, ClientSocket> = {};
    for (const s of [host, guest]) {
      const sync = await emit(s, 'game:sync_state', {});
      sockets[sync.snapshot.me.playerId] = s;
    }

    // Drive the game to completion by always playing the first legal card (or drawing).
    // Paced with a small delay — the server's generous 200-events/sec rate limiter still rejects
    // truly back-to-back local-loopback calls with no delay at all between them.
    for (let i = 0; i < 800 && !over; i++) {
      await new Promise((r) => setTimeout(r, 8));
      const sync = await emit(host, 'game:sync_state', {});
      if (!sync?.ok) continue; // transient (e.g. rate-limited) — just retry next tick
      const game = sync.snapshot.game;
      if (!game || game.gameStatus === 'FINISHED') break;
      if (game.gameStatus === 'CHOOSING_DIRECTION') {
        await emit(sockets[game.currentPlayerId], 'game:select_direction', { direction: 'RIGHT', turnNumber: game.turnNumber });
        continue;
      }
      const cur = sockets[game.currentPlayerId];
      if (!cur) continue;
      const hs = await emit(cur, 'game:sync_state', {});
      if (!hs?.ok || !hs.snapshot.hand) continue;
      const hand = hs.snapshot.hand;
      if (hand.playableCardIds.length > 0) {
        const cardId = hand.playableCardIds[0];
        const card = hand.hand.find((c: any) => c.id === cardId);
        await emit(cur, 'game:play_card', { cardId, turnNumber: game.turnNumber, chosenColor: card.color || 'RED' });
      } else if (hand.canDraw) {
        await emit(cur, 'game:draw_card', { turnNumber: game.turnNumber });
      }
      // else: stuck — the server auto-skips on its own; just keep polling.
    }

    await new Promise((r) => setTimeout(r, 50));

    const finalSync = await emit(host, 'game:sync_state', {});
    expect(finalSync.snapshot.room.status).toBe('WAITING'); // static room already reset, not stuck on FINISHED
    expect(rooms.find('TABLE1')?.isStatic).toBe(true);

    // The room should accept a brand-new game:start right away, with no manual "restart" step needed.
    const restartAck = await emit(host, 'game:start', {});
    expect(restartAck.ok).toBe(true);

    host.close();
    guest.close();
  });

  it('room:clear (host-only) kicks everyone and wipes the leaderboard for a dynamic room', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'Room H', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    expect(created.ok).toBe(true);
    const joinGuest = await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });
    expect(joinGuest.ok).toBe(true);

    let guestKicked: any = null;
    guest.on('room:kicked', (payload: any) => { guestKicked = payload; });

    // A non-host cannot clear the room.
    const deniedAck = await emit(guest, 'room:clear', {});
    expect(deniedAck.ok).toBe(false);

    const clearAck = await emit(host, 'room:clear', {});
    expect(clearAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 30));
    expect(guestKicked).toEqual({ reason: 'ROOM_CLEARED' });
    expect(rooms.find(created.code)).toBeNull(); // dynamic room is fully deleted

    host.close();
    guest.close();
  });

  it('room:clear on a static room empties its members but KEEPS the leaderboard (cleared separately)', async () => {
    const host = await connect();
    const joinHost = await emit(host, 'room:join', { code: 'TABLE2', nickname: 'ClearHost' });
    expect(joinHost.ok).toBe(true);
    rooms.find('TABLE2')!.leaderboard.set('someone', { nickname: 'Someone', wins: 2, losses: 1, gamesPlayed: 3 });

    const clearAck = await emit(host, 'room:clear', {});
    expect(clearAck.ok).toBe(true);

    const room = rooms.find('TABLE2');
    expect(room).not.toBeNull();
    expect(room?.isStatic).toBe(true);
    expect(room?.members).toHaveLength(0);
    expect(room?.leaderboard.size).toBe(1);
    expect(room?.status).toBe('WAITING');

    // Separate action: clear the leaderboard (static room — allowed from the room list).
    const lbAck = await emit(host, 'room:clear_leaderboard', { code: 'TABLE2' });
    expect(lbAck.ok).toBe(true);
    expect(rooms.find('TABLE2')?.leaderboard.size).toBe(0);

    host.close();
  });

  it('joining with a name that already exists in the room re-claims that same player (same name = same person)', async () => {
    const a = await connect();
    const b = await connect();
    const first = await emit(a, 'room:join', { code: 'TABLE4', nickname: 'Somchai' });
    expect(first.ok).toBe(true);
    let replaced = false;
    a.on('session:replaced', () => { replaced = true; });
    const second = await emit(b, 'room:join', { code: 'TABLE4', nickname: '  somchai ' });
    expect(second.ok).toBe(true);
    expect(second.playerId).toBe(first.playerId);
    expect(rooms.find('TABLE4')?.members).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(replaced).toBe(true);
    await emit(b, 'room:clear_by_code', { code: 'TABLE4' });
    a.close();
    b.close();
  });

  it('room:clear_leaderboard on a dynamic room is host-only', async () => {
    const host = await connect();
    const guest = await connect();
    const created = await emit(host, 'room:create', { name: 'LB', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    await emit(guest, 'room:join', { code: created.code, nickname: 'Guest' });
    expect((await emit(guest, 'room:clear_leaderboard', { code: created.code })).ok).toBe(false);
    expect((await emit(host, 'room:clear_leaderboard', { code: created.code })).ok).toBe(true);
    host.close();
    guest.close();
  });

  it('room:clear_by_code lets a browser on the room-LIST page clear a static table without joining it', async () => {
    const member = await connect();
    const bystander = await connect(); // someone browsing the join page, never joined TABLE3
    const joinAck = await emit(member, 'room:join', { code: 'TABLE3', nickname: 'ListPageTester' });
    expect(joinAck.ok).toBe(true);

    let memberKicked: any = null;
    member.on('room:kicked', (payload: any) => { memberKicked = payload; });

    // bystander isn't in the room at all, isn't the host — but the by-code variant still works.
    const clearAck = await emit(bystander, 'room:clear_by_code', { code: 'TABLE3' });
    expect(clearAck.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 30));
    expect(memberKicked).toEqual({ reason: 'ROOM_CLEARED' });

    const room = rooms.find('TABLE3');
    expect(room?.isStatic).toBe(true);
    expect(room?.members).toHaveLength(0);

    member.close();
    bystander.close();
  });

  it('room:clear_by_code refuses to touch a dynamic (code-joined) room', async () => {
    const host = await connect();
    const created = await emit(host, 'room:create', { name: 'Room I', nickname: 'Host', maxPlayers: 4, hostPlays: true });
    expect(created.ok).toBe(true);

    const ack = await emit(host, 'room:clear_by_code', { code: created.code });
    expect(ack.ok).toBe(false);
    expect(ack.error).toBe('NOT_STATIC_ROOM');
    expect(rooms.find(created.code)).not.toBeNull(); // untouched

    host.close();
  });
});
describe('RoomManager.recordMatchResult — leaderboard tracks losses too', () => {
  function fakeResult(ranking: { playerId: string; nickname: string; rank: number }[], winnerId: string | null) {
    return {
      gameId: 'g1',
      winnerId,
      reason: 'EMPTY_HAND' as const,
      ranking: ranking.map((r) => ({ ...r, cardsLeft: 0, cardsDrawn: 0 })),
      turns: 10,
      durationMs: 1000,
      totalCardsDrawn: 0,
      startedAt: 0,
      endedAt: 1000,
    };
  }

  it('credits a win for the winner and a loss for whoever finished dead last', () => {
    const rm = new RoomManager();
    const room = rm.createRoom({ name: 'LB Room', nickname: 'Alice', hostPlays: true }).room;
    const result = fakeResult(
      [
        { playerId: 'p1', nickname: 'Alice', rank: 1 },
        { playerId: 'p2', nickname: 'Bob', rank: 2 },
        { playerId: 'p3', nickname: 'Carol', rank: 3 },
      ],
      'p1',
    );
    rm.recordMatchResult(room, result);
    const lb = rm.toPublicRoom(room).leaderboard;
    expect(lb.find((e) => e.nickname === 'Alice')).toMatchObject({ wins: 1, losses: 0, gamesPlayed: 1 });
    expect(lb.find((e) => e.nickname === 'Bob')).toMatchObject({ wins: 0, losses: 0, gamesPlayed: 1 });
    expect(lb.find((e) => e.nickname === 'Carol')).toMatchObject({ wins: 0, losses: 1, gamesPlayed: 1 });
  });

  it('accumulates wins and losses across repeated matches for the same (by-name) player', () => {
    const rm = new RoomManager();
    const room = rm.createRoom({ name: 'LB Room 2', nickname: 'Alice', hostPlays: true }).room;
    rm.recordMatchResult(
      room,
      fakeResult([{ playerId: 'p1', nickname: 'alice', rank: 1 }, { playerId: 'p2', nickname: 'Bob', rank: 2 }], 'p1'),
    );
    rm.recordMatchResult(
      room,
      fakeResult([{ playerId: 'p1', nickname: 'ALICE', rank: 2 }, { playerId: 'p2', nickname: 'Bob', rank: 1 }], 'p2'),
    );
    const lb = rm.toPublicRoom(room).leaderboard;
    // 'alice' / 'ALICE' / 'Alice' are all the same person by name-key.
    expect(lb.find((e) => e.nickname.toLowerCase() === 'alice')).toMatchObject({ wins: 1, losses: 1, gamesPlayed: 2 });
    expect(lb.find((e) => e.nickname === 'Bob')).toMatchObject({ wins: 1, losses: 1, gamesPlayed: 2 });
  });
});
