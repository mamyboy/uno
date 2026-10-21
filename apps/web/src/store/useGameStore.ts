import { create } from 'zustand';
import type { PrivateHand, Room, GameState, GameResult } from '@cma/shared';

export interface Session {
  code: string;
  sessionToken: string;
  playerId: string;
}

interface GameStore {
  session: Session | null;
  room: Room | null;
  game: GameState | null;
  hand: PrivateHand | null;
  result: GameResult | null;
  connected: boolean;
  lastError: string | null;

  setSession: (s: Session | null) => void;
  setRoom: (r: Room | null) => void;
  setGame: (g: GameState | null) => void;
  setHand: (h: PrivateHand | null) => void;
  setResult: (res: GameResult | null) => void;
  setConnected: (c: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  session: null,
  room: null,
  game: null,
  hand: null,
  result: null,
  connected: false,
  lastError: null,

  setSession: (session) => set({ session }),
  setRoom: (room) => set({ room }),
  setGame: (game) => set({ game }),
  setHand: (hand) => set({ hand }),
  setResult: (result) => set({ result }),
  setConnected: (connected) => set({ connected }),
  setError: (lastError) => set({ lastError }),
  reset: () => set({ room: null, game: null, hand: null, result: null, lastError: null }),
}));