import { randomInt, randomUUID } from 'node:crypto';
import { COLORS, ACTION_KINDS, type Card } from '@cma/shared';

export type Rng = (maxExclusive: number) => number;
export const cryptoRng: Rng = (max) => randomInt(max);

/** 76 cards: per color, one 0 and two each of 1-9. */
export function createNumberCards(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let value = 0; value <= 9; value++) {
      const copies = value === 0 ? 1 : 2;
      for (let c = 0; c < copies; c++) deck.push({ id: randomUUID().slice(0, 12), kind: 'NUMBER', color, value });
    }
  }
  return deck;
}

/** 24 cards: Skip, Reverse, Draw Two — two of each per color (4 colors x 3 kinds x 2 copies). */
export function createActionCards(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (const kind of ACTION_KINDS) {
      for (let c = 0; c < 2; c++) deck.push({ id: randomUUID().slice(0, 12), kind, color });
    }
  }
  return deck;
}

/** 14 cards: 4x Wild, 4x Wild Draw Two, 4x Wild Draw Four, 2x Wild Draw Eight — colorless until played. */
export function createWildCards(): Card[] {
  const deck: Card[] = [];
  for (let c = 0; c < 4; c++) deck.push({ id: randomUUID().slice(0, 12), kind: 'WILD', color: null });
  for (let c = 0; c < 4; c++) deck.push({ id: randomUUID().slice(0, 12), kind: 'WILD_DRAW_TWO', color: null });
  for (let c = 0; c < 4; c++) deck.push({ id: randomUUID().slice(0, 12), kind: 'WILD_DRAW_FOUR', color: null });
  for (let c = 0; c < 2; c++) deck.push({ id: randomUUID().slice(0, 12), kind: 'WILD_DRAW_EIGHT', color: null });
  return deck;
}

/** 4 cards: REFLECT (สะท้อนกลับ) — colorless, bounces a pending combo back to its sender. */
export function createReflectCards(): Card[] {
  return Array.from({ length: 4 }, () => ({ id: randomUUID().slice(0, 12), kind: 'REFLECT' as const, color: null }));
}

/** Standard deck: 76 number + 24 action + 14 wild + 4 reflect = 118 cards. */
export function createDeck(): Card[] {
  return [...createNumberCards(), ...createActionCards(), ...createWildCards(), ...createReflectCards()];
}

/** @deprecated kept for backward-compat test imports; use createNumberCards(). */
export const createNumberDeck = createNumberCards;

export function shuffle<T>(items: readonly T[], rng: Rng = cryptoRng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}