import type { Card, Direction } from './types';

export function isWild(card: Card): boolean {
  return (
    card.kind === 'WILD' ||
    card.kind === 'WILD_DRAW_FOUR' ||
    card.kind === 'WILD_DRAW_TWO' ||
    card.kind === 'WILD_DRAW_EIGHT'
  );
}

/**
 * A card may be played on `top` when:
 *  - it's a Wild / Wild Draw Four (always playable, color chosen separately), or
 *  - its color matches the top card's resolved color, or
 *  - its kind matches the top card's kind AND (for NUMBER cards) its value also matches.
 *    This lets e.g. a RED Skip be played on a YELLOW Skip (symbol match), same as real UNO.
 */
export function canPlayCard(card: Card, top: Card | null | undefined): boolean {
  if (!top) return false;
  if (card.kind === 'REFLECT' || card.kind === 'SHIELD') return false; // only ever playable as a combo counter (engine-side)
  if (card.kind === 'SHUFFLE' || card.kind === 'STEAL_COMBO') return true; // colorless — playable on any top card, any time it's your turn (even vs a combo)
  if (isWild(card)) return true;
  if (card.color !== null && card.color === top.color) return true;
  if (card.kind === top.kind) {
    if (card.kind === 'NUMBER') return card.value === top.value;
    return true;
  }
  return false;
}

/** Normalized identity key for a nickname — the leaderboard treats identical names (ignoring
 * case and extra whitespace) as the same person. */
export function nameKey(nickname: string): string {
  return nickname.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function nextSeatIndex(current: number, count: number, direction: Direction): number {
  return direction === 'LEFT' ? (current - 1 + count) % count : (current + 1) % count;
}