export const COLORS = ['RED', 'YELLOW', 'GREEN', 'BLUE'] as const;
export type CardColor = (typeof COLORS)[number];

/** REFLECT (สะท้อนกลับ): colorless; only playable while a +2/+4/+8 combo is pending against you —
 * bounces the whole combo back to the player who sent it. Vanishes from every hand once the draw
 * pile is empty and nobody holds any draw-family card anymore (it could never be used again). */
/** SHIELD (โล่ป้องกัน): colorless; only playable vs a pending combo — passes it on, unchanged, to the
 *  NEXT player in the current direction. Vanishes like REFLECT once it can never be useful again.
 *  SHUFFLE (สลับที่นั่ง): colorless; playable on your turn whenever no combo is pending — randomly
 *  reshuffles the seating order, then play continues with whoever now sits after you. */
export type CardKind = 'NUMBER' | 'SKIP' | 'REVERSE' | 'DRAW_TWO' | 'WILD' | 'WILD_DRAW_FOUR' | 'WILD_DRAW_TWO' | 'WILD_DRAW_EIGHT' | 'REFLECT' | 'SHIELD' | 'SHUFFLE';
export const ACTION_KINDS = ['SKIP', 'REVERSE', 'DRAW_TWO'] as const;
export const WILD_KINDS = ['WILD', 'WILD_DRAW_FOUR', 'WILD_DRAW_TWO', 'WILD_DRAW_EIGHT'] as const;
/** color is null only for WILD / WILD_DRAW_FOUR / WILD_DRAW_TWO / WILD_DRAW_EIGHT before a color is chosen when played. */
export interface Card { id: string; kind: CardKind; color: CardColor | null; value?: number }

export type Direction = 'LEFT' | 'RIGHT';
export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';
export type GameStatus = 'CHOOSING_DIRECTION' | 'PLAYING' | 'FINISHED';

export const MIN_PLAYERS = 2;
/** No practical room limit — anyone can join until the game starts (then the room locks). */
export const MAX_PLAYERS = 100;
export const HAND_SIZE = 7;

/** Soundboard clips — all from myinstants.com (Thailand index), served from /sounds/mi/<id>.mp3. */
export const SOUND_IDS = [
  "2-tlktbmuk-2",
  "fahhhhhhhhhhhhhh",
  "vine-boom",
  "faaah",
  "among-us-role-reveal-sound",
  "aimaihwaelw",
  "sngsay",
  "w-thch",
  "shocked-sound-effect",
  "anime-wow-sound-effect",
  "rizz-sound-effect",
  "diitebtaaethset-r",
  "ack",
  "untitled-cbdlljd",
  "thuukt-ng",
  "wing",
  "bone-crack",
  "wuued-luuen",
  "m-fixed-bbp6dw2",
  "dexter-meme",
  "singsakdisiththi",
  "indian-song",
  "dry-fart",
  "tununuuuu",
  "spiderman-meme-song",
  "tf-nemesis",
  "dukdik",
  "phmkh-othskhrabphii",
  "error-cdoxcym",
  "ngng",
  "buy-1",
  "tuengopa-s6yirpv",
  "khidd",
  "ding-sound-effect-2",
  "ceeday-huh-sound-effect",
  "m-fixed-yqrdem9",
  "punch",
  "mlg-airhorn",
  "spongebob-fail",
  "dun-dun-dun",
] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export const SOUND_LABELS: Record<SoundId, string> = {
  "2-tlktbmuk-2": "2_ตลกตบมุก_2",
  "fahhhhhhhhhhhhhh": "FAHHHHHHHHHHHHHH",
  "vine-boom": "VINE BOOM SOUND",
  "faaah": "FAAAH",
  "among-us-role-reveal-sound": "Among Us role reveal sound",
  "aimaihwaelw": "ไม่ไหวแล้ว",
  "sngsay": "สงสัย",
  "w-thch": "วอทซ์",
  "shocked-sound-effect": "Shocked sound",
  "anime-wow-sound-effect": "Anime Wow",
  "rizz-sound-effect": "rizz sound effect",
  "diitebtaaethset-r": "อดีตเบต้าเทสเตอร์",
  "ack": "ACK",
  "untitled-cbdlljd": "เสียงน้าค้อม =w=",
  "thuukt-ng": "ถูกต้อง",
  "wing": "วิ้ง",
  "bone-crack": "Bone Crack",
  "wuued-luuen": "วื๊ด ลื่น",
  "m-fixed-bbp6dw2": "จ๊ะเอ๋ตัวเอง",
  "dexter-meme": "Dexter meme",
  "singsakdisiththi": "สิ่งศักดิ์สิทธิ์ๆๆๆๆ",
  "indian-song": "indian song",
  "dry-fart": "Fart",
  "tununuuuu": "Tununuuuu",
  "spiderman-meme-song": "spiderman meme song",
  "tf-nemesis": "Sad Violin (the meme one)",
  "dukdik": "ดุ๊กดิ๊ก",
  "phmkh-othskhrabphii": "ผมขอโทษครับพี่",
  "error-cdoxcym": "Error SOUNDSS",
  "ngng": "งง",
  "buy-1": "buy",
  "tuengopa-s6yirpv": "ตึงโป๊ะๆ",
  "khidd": "คิดด",
  "ding-sound-effect-2": "ding sound effect",
  "ceeday-huh-sound-effect": "Huh? Ceeday",
  "m-fixed-yqrdem9": "เบรคมุก",
  "punch": "Punch Sound",
  "mlg-airhorn": "MLG AIR HORN!!!",
  "spongebob-fail": "SpongeBob Fail",
  "dun-dun-dun": "dun dun dunnnn",
};

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
  leaderboardCount?: number;
  topPlayer?: { nickname: string; wins: number } | null;
}

export type HistoryAction = 'DIRECTION' | 'PLAY' | 'DRAW' | 'SKIP' | 'RESHUFFLE' | 'STEAL' | 'ABSORB' | 'REFLECT' | 'SHIELD' | 'SHUFFLE_SEATS' | 'VANISH';
export interface HistoryEntry {
  seq: number;
  at: number;
  turnNumber: number;
  playerId: string | null;
  action: HistoryAction;
  card?: Card;
  cards?: Card[];
  direction?: Direction;
  /** For SHUFFLE_SEATS entries: the new seating order (player ids). */
  seatOrder?: string[];
  /** For STEAL entries: whose hand the card was pulled from. For REFLECT: who the combo came from. */
  fromPlayerId?: string;
  /** For REFLECT entries: who the combo was bounced to. */
  toPlayerId?: string;
  /** For ABSORB / REFLECT entries: the combo size; for VANISH: how many REFLECT cards vanished. */
  count?: number;
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
  pendingDraw: { count: number; targetId: string; fromId?: string | null } | null;
  /** Players who have already emptied their hand, in finish order (index 0 = 1st place). The
   * game continues for everyone else until only one player still holds cards. */
  finishedOrder: string[];
}

export interface PrivateHand {
  hand: Card[];
  playableCardIds: string[];
  canDraw: boolean;
  /** True when the ONLY playable cards are Wild Draw Two/Four/Eight — player may choose to draw instead of playing a Wild Draw. */
  canDrawInsteadOfWild: boolean;
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