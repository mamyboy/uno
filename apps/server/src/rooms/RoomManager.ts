import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { MAX_PLAYERS, MIN_PLAYERS, nameKey, type GameResult, type Room, type RoomStatus, type StaticRoomSummary } from '@cma/shared';
import { GameEngine, GameError } from '../engine/GameEngine';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 30 * 60 * 1000;

export interface LeaderboardRecord {
  nickname: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  avatar?: string | null;
}

export interface ServerMember {
  id: string;
  nickname: string;
  sessionToken: string;
  seatIndex: number;
  connected: boolean;
  isHost: boolean;
  isPlayer: boolean;
  socketId: string | null;
  lastSeen: number;
  avatar?: string | null;
}

export interface ServerRoom {
  id: string;
  code: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  status: RoomStatus;
  members: ServerMember[];
  createdAt: Date;
  engine: GameEngine | null;
  lastResult: GameResult | null;
  isStatic: boolean;
  leaderboard: Map<string, LeaderboardRecord>;
  voiceEnabled?: boolean;
}

const STATIC_ROOM_DEFS: { code: string; name: string; maxPlayers: number }[] = [
  { code: 'TABLE1', name: 'โต๊ะ 1 · เริ่มต้น', maxPlayers: MAX_PLAYERS },
  { code: 'TABLE2', name: 'โต๊ะ 2 · มือใหม่', maxPlayers: MAX_PLAYERS },
  { code: 'TABLE3', name: 'โต๊ะ 3 · สนุกสนาน', maxPlayers: MAX_PLAYERS },
  { code: 'TABLE4', name: 'โต๊ะ 4 · ท้าทาย', maxPlayers: MAX_PLAYERS },
];

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  private sessions = new Map<string, { code: string; playerId: string }>();

  get size() { return this.rooms.size; }
  find(code: string) { return this.rooms.get(code.toUpperCase()) ?? null; }
  get(code: string) {
    const room = this.find(code);
    if (!room) throw new GameError('ROOM_NOT_FOUND');
    return room;
  }

  players(room: ServerRoom) {
    return room.members.filter((m) => m.isPlayer).sort((a, b) => a.seatIndex - b.seatIndex);
  }

  getMember(room: ServerRoom, playerId: string): ServerMember | null {
    return room.members.find((m) => m.id === playerId) ?? null;
  }

  deleteRoom(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return;
    room.members.forEach((m) => this.sessions.delete(m.sessionToken));
    this.rooms.delete(code.toUpperCase());
  }

  setConnected(room: ServerRoom, playerId: string, connected: boolean, socketId: string | null) {
    const member = this.getMember(room, playerId);
    if (!member) return;
    member.connected = connected;
    member.socketId = socketId;
    member.lastSeen = Date.now();
  }

  assertHost(room: ServerRoom, playerId: string) {
    if (room.hostId !== playerId) throw new GameError('HOST_ONLY');
  }

  /** Create (or re-verify) the fixed set of always-available, pick-and-join static rooms. */
  ensureStaticRooms() {
    for (const def of STATIC_ROOM_DEFS) {
      if (this.rooms.has(def.code)) continue;
      const room: ServerRoom = {
        id: randomUUID(), code: def.code, name: def.name, hostId: '', maxPlayers: def.maxPlayers,
        status: 'WAITING', members: [], createdAt: new Date(), engine: null, lastResult: null,
        isStatic: true, leaderboard: new Map(),
      };
      this.rooms.set(def.code, room);
    }
  }

  listStaticRooms(): StaticRoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => r.isStatic)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((r) => ({
        code: r.code, name: r.name, status: r.status,
        playerCount: this.players(r).length, maxPlayers: r.maxPlayers,
        leaderboardCount: r.leaderboard.size,
        topPlayer: this.topOf(r),
      }));
  }

  private topOf(room: ServerRoom): { nickname: string; wins: number } | null {
    let best: LeaderboardRecord | null = null;
    for (const e of room.leaderboard.values()) {
      if (!best || e.wins > best.wins || (e.wins === best.wins && e.gamesPlayed > best.gamesPlayed)) best = e;
    }
    return best && best.wins > 0 ? { nickname: best.nickname, wins: best.wins } : null;
  }

  createRoom(input: { name: string; nickname: string; maxPlayers?: number; hostPlays: boolean }) {
    const code = this.generateCode();
    const host = this.newMember(input.nickname, true, input.hostPlays);
    const room: ServerRoom = {
      id: randomUUID(), code, name: input.name, hostId: host.id, maxPlayers: MAX_PLAYERS,
      status: 'WAITING', members: [host], createdAt: new Date(), engine: null, lastResult: null,
      isStatic: false, leaderboard: new Map(),
    };
    this.reseat(room);
    this.rooms.set(code, room);
    this.sessions.set(host.sessionToken, { code, playerId: host.id });
    return { room, member: host };
  }

  joinRoom(code: string, nickname: string, sessionToken?: string) {
    const room = this.get(code);
    if (sessionToken) {
      const existing = this.resolveSession(code, sessionToken);
      if (existing) return { ...existing, rejoined: true };
      // Stale token (e.g. the player was kicked on disconnect): never silently join as a new
      // player under a placeholder name — the client falls back to a fresh join by nickname.
      throw new GameError('SESSION_INVALID');
    }
    const name = nickname.trim().replace(/\s+/g, ' ');
    // Same name = same person: re-claim that member's seat (e.g. a refresh, a new device, or a
    // cleared browser session) instead of creating a duplicate player — works mid-game too.
    const sameName = room.members.find((m) => nameKey(m.nickname) === nameKey(name));
    if (sameName) return { room, member: sameName, rejoined: true, previousSocketId: sameName.socketId };
    // No player limit. Joining while a match is running is allowed: the newcomer gets a seat but
    // sits out (shown as "waiting") until the next match starts — startGame deals in every player.
    const becomesHost = room.members.length === 0;
    const member = this.newMember(name, becomesHost, true);
    member.seatIndex = this.players(room).length;
    room.members.push(member);
    if (becomesHost) room.hostId = member.id;
    this.sessions.set(member.sessionToken, { code: room.code, playerId: member.id });
    return { room, member, rejoined: false };
  }

  reconnect(code: string, sessionToken: string) {
    const found = this.resolveSession(code, sessionToken);
    if (!found) throw new GameError('SESSION_INVALID');
    return found;
  }

  removeMember(room: ServerRoom, playerId: string) {
    const idx = room.members.findIndex((m) => m.id === playerId);
    if (idx < 0) return null;
    const [member] = room.members.splice(idx, 1);
    this.sessions.delete(member.sessionToken);
    if (room.engine && room.status === 'PLAYING') room.engine.removePlayer(member.id);
    if (room.members.length === 0) {
      if (room.isStatic) {
        // Static rooms never get deleted — just reset back to an empty, host-less lobby.
        room.status = 'WAITING';
        room.engine = null;
        room.lastResult = null;
        room.hostId = '';
        return member;
      }
      this.rooms.delete(room.code);
      return member;
    }
    if (member.isHost) {
      const next = room.members.find((m) => m.connected) ?? room.members[0];
      next.isHost = true;
      room.hostId = next.id;
    }
    this.reseat(room);
    return member;
  }

  /** Full reset of a single room, host-only: kicks every member (including the host) and wipes any in-progress game — as if the room had just been created.
   *  Static rooms (TABLE1-4) stay in place, emptied. Dynamic (code-joined) rooms are deleted
   *  entirely, same as when the last member normally leaves. Returns the sessionTokens that were
   *  invalidated and the socketIds that need to be kicked off the room channel. */
  clearRoom(room: ServerRoom, requesterId: string) {
    this.assertHost(room, requesterId);
    return this.doClearRoom(room);
  }

  /** Same reset as clearRoom(), but callable from OUTSIDE the room (e.g. the room-list/join page,
   *  before the caller has joined anything) — looked up by code, with no host/membership check.
   *  Only ever exposed for STATIC rooms (TABLE1-4): there's no sense "clearing by code" a dynamic
   *  room the caller was never even in, and it would be destroyed anyway. */
  clearStaticRoomByCode(code: string) {
    const room = this.get(code);
    if (!room.isStatic) throw new GameError('NOT_STATIC_ROOM');
    return this.doClearRoom(room);
  }

  private doClearRoom(room: ServerRoom) {
    const kicked = room.members.map((m) => ({ playerId: m.id, socketId: m.socketId }));
    room.members.forEach((m) => this.sessions.delete(m.sessionToken));
    if (room.isStatic) {
      room.members = [];
      room.status = 'WAITING';
      room.engine = null;
      room.lastResult = null;
      room.hostId = '';
      // Leaderboard is kept — clearing it is a separate action (clearLeaderboard).
    } else {
      this.rooms.delete(room.code);
    }
    return kicked;
  }

  /** Wipe a room's by-name leaderboard. Static rooms: anyone (from the room list). Dynamic rooms:
   *  host only. */
  clearLeaderboard(code: string, requesterId: string | undefined) {
    const room = this.get(code);
    if (!room.isStatic) this.assertHost(room, requesterId ?? '');
    room.leaderboard = new Map();
    return room;
  }

  reorder(room: ServerRoom, requesterId: string, playerIds: string[]) {
    this.assertHost(room, requesterId);
    if (room.status === 'PLAYING') throw new GameError('GAME_IN_PROGRESS');
    const ps = this.players(room);
    if (playerIds.length !== ps.length || !ps.every((p) => playerIds.includes(p.id))) {
      throw new GameError('INVALID_ORDER');
    }
    this.reseat(room, playerIds.map((id) => ps.find((p) => p.id === id)!));
  }

  setHostPlays(room: ServerRoom, requesterId: string, hostPlays: boolean) {
    this.assertHost(room, requesterId);
    if (room.status === 'PLAYING') throw new GameError('GAME_IN_PROGRESS');
    const host = room.members.find((m) => m.id === room.hostId)!;
    if (host.isPlayer === hostPlays) return;
    host.isPlayer = hostPlays;
    host.seatIndex = hostPlays ? Number.MAX_SAFE_INTEGER : -1;
    this.reseat(room);
  }

  /** Content-addressed avatar images (hash → bytes). Room snapshots carry only a short
   * `/avatars/<hash>.<ext>` path; browsers fetch each picture once and cache it forever. */
  private avatars = new Map<string, { mime: string; data: Buffer }>();

  getAvatar(file: string): { mime: string; data: Buffer } | null {
    return this.avatars.get(file) ?? null;
  }

  /** Accepts a data URL (or an already-stored /avatars/ path) and returns the public path. */
  private storeAvatar(avatar: string): string {
    if (avatar.startsWith('/avatars/')) {
      if (!this.avatars.has(avatar.slice('/avatars/'.length))) throw new GameError('INVALID_AVATAR');
      return avatar;
    }
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(avatar);
    if (!m) throw new GameError('INVALID_AVATAR');
    const data = Buffer.from(m[3], 'base64');
    if (data.length < 50 || data.length > 220_000) throw new GameError('INVALID_AVATAR');
    const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    const file = `${createHash('sha1').update(data).digest('hex').slice(0, 20)}.${ext}`;
    if (!this.avatars.has(file)) this.avatars.set(file, { mime: m[1], data });
    return `/avatars/${file}`;
  }

  /** Drop stored pictures no member or leaderboard row references any more. */
  private sweepAvatars() {
    const used = new Set<string>();
    for (const room of this.rooms.values()) {
      for (const mem of room.members) if (mem.avatar) used.add(mem.avatar.slice('/avatars/'.length));
      for (const e of room.leaderboard.values()) if (e.avatar) used.add(e.avatar.slice('/avatars/'.length));
    }
    for (const k of this.avatars.keys()) if (!used.has(k)) this.avatars.delete(k);
  }

  setAvatar(room: ServerRoom, playerId: string, rawAvatar: string) {
    const member = this.getMember(room, playerId);
    if (!member) throw new GameError('NOT_IN_ROOM');
    const avatar = this.storeAvatar(rawAvatar);
    member.avatar = avatar;
    const key = nameKey(member.nickname);
    const entry = room.leaderboard.get(key) ?? { nickname: member.nickname, wins: 0, losses: 0, gamesPlayed: 0 };
    entry.nickname = member.nickname;
    entry.avatar = avatar;
    room.leaderboard.set(key, entry);
  }

  /** Roll a finished match's ranking into the room's persistent by-name leaderboard. */
  recordMatchResult(room: ServerRoom, result: GameResult) {
    // Dead last in the ranking is the single "ดุ่ยดุ้ย" loser of the match (only counted when
    // there were at least 2 ranked players — a 1-player test/edge case has no loser to blame).
    const lastRank = result.ranking.length > 1 ? Math.max(...result.ranking.map((r) => r.rank)) : -1;
    for (const r of result.ranking) {
      const key = nameKey(r.nickname);
      const entry = room.leaderboard.get(key) ?? { nickname: r.nickname, wins: 0, losses: 0, gamesPlayed: 0 };
      entry.nickname = r.nickname;
      entry.gamesPlayed += 1;
      if (result.winnerId && r.playerId === result.winnerId) entry.wins += 1;
      if (r.rank === lastRank) entry.losses += 1;
      const member = room.members.find((m) => m.id === r.playerId);
      if (member?.avatar) entry.avatar = member.avatar;
      room.leaderboard.set(key, entry);
    }
  }

  startGame(room: ServerRoom, requesterId: string, restart = false) {
    this.assertHost(room, requesterId);
    if (!restart && room.status === 'PLAYING') throw new GameError('GAME_IN_PROGRESS');
    const ps = this.players(room);
    if (ps.length < MIN_PLAYERS) throw new GameError('NOT_ENOUGH_PLAYERS');
    if (ps.some((p) => !p.connected)) throw new GameError('PLAYER_DISCONNECTED');
    room.engine = new GameEngine(room.id, ps.map((p) => p.id));
    room.status = 'PLAYING';
    room.lastResult = null;
    return room.engine;
  }

  toPublicRoom(room: ServerRoom): Room {
    const counts = room.engine?.getCardCounts() ?? {};
    const leaderboard = [...room.leaderboard.values()]
      .sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed || a.nickname.localeCompare(b.nickname))
      .map((e) => ({ nickname: e.nickname, wins: e.wins, losses: e.losses ?? 0, gamesPlayed: e.gamesPlayed, avatar: e.avatar ?? null }));
    return {
      id: room.id, code: room.code, name: room.name, hostId: room.hostId, status: room.status,
      maxPlayers: room.maxPlayers, createdAt: room.createdAt.toISOString(), isStatic: room.isStatic,
      voiceEnabled: room.voiceEnabled !== false,
      players: room.members.map((m) => ({
        id: m.id, nickname: m.nickname, seatIndex: m.seatIndex, cardCount: counts[m.id] ?? 0,
        connected: m.connected, isHost: m.isHost, isPlayer: m.isPlayer,
        waiting: room.status === 'PLAYING' && !!room.engine && m.isPlayer && !room.engine.isInGame(m.id),
        isWinner: room.lastResult?.winnerId === m.id, avatar: m.avatar ?? null,
      })),
      leaderboard,
    };
  }

  sweep(now = Date.now()) {
    this.sweepAvatars();
    for (const room of this.rooms.values()) {
      if (room.isStatic) continue; // static rooms persist forever, regardless of activity
      const alive = room.members.some((m) => m.connected || now - m.lastSeen < ROOM_TTL_MS);
      if (!alive) {
        room.members.forEach((m) => this.sessions.delete(m.sessionToken));
        this.rooms.delete(room.code);
      }
    }
  }

  /** Clear ALL rooms (including static TABLE1-4) and recreate static tables fresh.
   *  Call this when you want a complete server-side reset of all connections. */
  clearAllRooms() {
    for (const room of this.rooms.values()) {
      room.members.forEach((m) => this.sessions.delete(m.sessionToken));
    }
    this.rooms.clear();
    this.ensureStaticRooms();
  }

  private resolveSession(code: string, token: string) {
    const s = this.sessions.get(token);
    if (!s || s.code !== code.toUpperCase()) return null;
    const room = this.rooms.get(s.code);
    const member = room?.members.find((m) => m.id === s.playerId);
    return room && member ? { room, member } : null;
  }

  private reseat(room: ServerRoom, ordered?: ServerMember[]) {
    (ordered ?? this.players(room)).forEach((p, i) => (p.seatIndex = i));
    room.members.filter((m) => !m.isPlayer).forEach((m) => (m.seatIndex = -1));
  }

  private newMember(nickname: string, isHost: boolean, isPlayer: boolean): ServerMember {
    return {
      id: randomUUID(), nickname: nickname.trim(), sessionToken: randomBytes(24).toString('base64url'),
      seatIndex: -1, connected: true, isHost, isPlayer, socketId: null, lastSeen: Date.now(), avatar: null,
    };
  }

  private generateCode() {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new GameError('SERVER_BUSY');
  }
}
