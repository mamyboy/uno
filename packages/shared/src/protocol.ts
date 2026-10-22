import { z } from 'zod';
import { COLORS, MAX_PLAYERS, MIN_PLAYERS, SOUND_IDS, type SyncPayload } from './types';

export const EV = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_WATCH: 'room:watch',
  ROOM_REORDER: 'room:reorder',
  ROOM_KICK: 'room:kick',
  ROOM_CLEAR: 'room:clear',
  ROOM_CLEAR_BY_CODE: 'room:clear_by_code',
  ROOM_CLEAR_LEADERBOARD: 'room:clear_leaderboard',
  ROOM_SET_HOST_PLAYS: 'room:set_host_plays',
  ROOM_LIST: 'room:list',
  ROOM_SET_AVATAR: 'room:set_avatar',
  ROOM_PLAY_SOUND: 'room:play_sound',
  ROOM_PLAYER_JOINED: 'room:player_joined',
  ROOM_PLAYER_LEFT: 'room:player_left',
  ROOM_STATE_UPDATED: 'room:state_updated',
  ROOM_KICKED: 'room:kicked',
  GAME_START: 'game:start',
  GAME_DEAL_CARDS: 'game:deal_cards',
  GAME_SELECT_DIRECTION: 'game:select_direction',
  GAME_PLAY_CARD: 'game:play_card',
  GAME_PLAY_CARDS: 'game:play_cards',
  GAME_DRAW_CARD: 'game:draw_card',
  GAME_TURN_CHANGED: 'game:turn_changed',
  GAME_CARD_PLAYED: 'game:card_played',
  GAME_CARD_DRAWN: 'game:card_drawn',
  GAME_GAME_OVER: 'game:game_over',
  GAME_RESTART: 'game:restart',
  GAME_STATE: 'game:state',
  GAME_HAND_UPDATED: 'game:hand_updated',
  GAME_SYNC_STATE: 'game:sync_state',
  PLAYER_DISCONNECTED: 'player:disconnected',
  PLAYER_RECONNECTED: 'player:reconnected',
  PLAYER_RECONNECT: 'player:reconnect',
  SESSION_REPLACED: 'session:replaced',
  ADMIN_RESET_ALL: 'admin:reset_all',
} as const;

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const nickname = z.string().trim().min(1).max(16);
const turn = z.number().int().min(0);

export const schemas = {
  empty: z.object({}).strip(),
  createRoom: z.object({
    name: z.string().trim().min(1).max(40),
    nickname,
    maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
    hostPlays: z.boolean(),
  }),
  joinRoom: z.object({ code, nickname, sessionToken: z.string().max(100).optional() }),
  reconnect: z.object({ code, sessionToken: z.string().min(10).max(100) }),
  watch: z.object({ code }),
  clearByCode: z.object({ code }),
  reorder: z.object({ playerIds: z.array(z.string().max(64)).min(1).max(MAX_PLAYERS) }),
  kick: z.object({ playerId: z.string().max(64) }),
  setHostPlays: z.object({ hostPlays: z.boolean() }),
  selectDirection: z.object({ direction: z.enum(['LEFT', 'RIGHT']), turnNumber: turn }),
  playCard: z.object({ cardId: z.string().max(64), turnNumber: turn, chosenColor: z.enum(COLORS).optional() }),
  playCards: z.object({ cardIds: z.array(z.string().max(64)).min(2).max(10), turnNumber: turn, chosenColor: z.enum(COLORS).optional() }),
  drawCard: z.object({ turnNumber: turn, drawInsteadOfWild: z.boolean().optional() }),
  setAvatar: z.object({ avatar: z.string().max(300_000) }),
  playSound: z.object({ soundId: z.enum(SOUND_IDS) }),
};

export type CreateRoomInput = z.infer<typeof schemas.createRoom>;
export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export interface JoinResult { code: string; sessionToken: string; playerId: string; sync: SyncPayload }