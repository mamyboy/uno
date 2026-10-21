export const COLORS = ['RED', 'YELLOW', 'GREEN', 'BLUE'] as const;
export type CardColor = (typeof COLORS)[number];

export type CardKind = 'NUMBER' | 'SKIP' | 'REVERSE' | 'DRAW_TWO' | 'WILD' | 'WILD_DRAW_FOUR' | 'WILD_DRAW_TWO' | 'WILD_DRAW_EIGHT';
export const ACTION_KINDS = ['SKIP', 'REVERSE', 'DRAW_TWO'] as const;
export const WILD_KINDS = ['WILD', 'WILD_DRAW_FOUR', 'WILD_DRAW_TWO', 'WILD_DRAW_EIGHT'] as const;
/** color is null only for WILD / WILD_DRAW_FOUR / WILD_DRAW_TWO / WILD_DRAW_EIGHT before a color is chosen when played. */
export interface Card { id: string; kind: CardKind; color: CardColor | null; value?: number }

export type Direction = 'LEFT' | 'RIGHT';
export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';
export type GameStatus = 'CHOOSING_DIRECTION' | 'PLAYING' | 'FINISHED';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const HAND_SIZE = 7;

/** Soundboard clips — fixed whitelist of filenames served from /sounds/<id>.mp3 on the web app. */
export const SOUND_IDS = [
  'ไอ้สัด',
  'ผมขอโทษครับพี่',
  'จ๊ะเอ๋ตัวเอง',
  'สิ่งศักดิ์สิทธิ์',
  'เสียงน้าค้อม',
  'อดีตเบต้าเทสเตอร์',
  'ไม่ไหวแล้ว',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export interface Player {
  id: string;
  nickname: string;
  seatIndex: number;
  cardCount: number;
  connected: boolean;
  isHost: boolean;
  isPlayer: boolean;
  isWinner: boolean;
  avatar?: string | null;
}

export interface LeaderboardEntry {
  nickname: string;
  wins: number;
  gamesPlayed: number;
  avatar?: string | null;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  status: RoomStatus;
  maxPlayers: number;
  players: Player[];
  createdAt: string;
  isStatic?: boolean;
  leaderboard: LeaderboardEntry[];
}

export interface StaticRoomSummary {
  code: string;
  name: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
}

export type HistoryAction = 'DIRECTION' | 'PLAY' | 'DRAW' | 'SKIP' | 'RESHUFFLE' | 'STEAL';
export interface HistoryEntry {
  seq: number;
  at: number;
  turnNumber: number;
  playerId: string | null;
  action: HistoryAction;
  card?: Card;
  cards?: Card[];
  direction?: Direction;
  /** For STEAL entries: whose hand the card was pulled from. */
  fromPlayerId?: string;
}

export interface GameState {
  roomId: string;
  gameId: string;
  gameStatus: GameStatus;
  currentPlayerId: string | null;
  firstPlayerId: string;
  direction: Direction | null;
  directionSelected: boolean;
  topCard: Card;
  drawPileCount: number;
  discardPile: Card[];
  discardCount: number;
  turnNumber: number;
  winnerId: string | null;
  seatOrder: string[];
  cardCounts: Record<string, number>;
  history: HistoryEntry[];
  startedAt: number;
  endedAt: number | null;
  /** Active +2/+4 combo: `targetId` must stack another Draw card or absorb `count` cards. */
  pendingDraw: { count: number; targetId: string } | null;
  /** Players who have already emptied their hand, in finish order (index 0 = 1st place). The
   * game continues for everyone else until only one player still holds cards. */
  finishedOrder: string[];
}

export interface PrivateHand {
  hand: Card[];
  playableCardIds: string[];
  canDraw: boolean;
  isMyTurn: boolean;
}

export type FinishReason = 'EMPTY_HAND' | 'STALEMATE' | 'LAST_PLAYER';
export interface RankingEntry { playerId: string; nickname: string; cardsLeft: number; cardsDrawn: number; rank: number }
export interface GameResult {
  gameId: string;
  winnerId: string | null;
  reason: FinishReason;
  ranking: RankingEntry[];
  turns: number;
  durationMs: number;
  totalCardsDrawn: number;
  startedAt: number;
  endedAt: number;
}

export interface SyncPayload {
  room: Room;
  game: GameState | null;
  me: { playerId: string } | null;
  hand: PrivateHand | null;
  result: GameResult | null;
}