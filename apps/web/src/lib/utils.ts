import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CARD_COLOR_CLASSES: Record<string, string> = {
  RED: 'bg-gradient-to-br from-red-500 via-red-600 to-red-800 border-red-900',
  YELLOW: 'bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-600 border-amber-700',
  GREEN: 'bg-gradient-to-br from-emerald-400 via-emerald-600 to-emerald-800 border-emerald-900',
  BLUE: 'bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800 border-blue-900',
};

/** Colorless Wild / Wild Draw Four: real UNO wild cards are solid black, not a rainbow pie —
 *  the color is conveyed entirely by the center pinwheel/grid badge, so the card reads instantly
 *  as "any color" without looking noisy. */
export const WILD_CARD_BG = 'linear-gradient(145deg, #27272a 0%, #18181b 55%, #000000 100%)';
export const WILD_CARD_BORDER = 'border-zinc-900';

/** Premium black-and-gold foil treatment for the Draw-family Wild cards (+2/+4/+8) — a diagonal
 *  metallic gold sheen over a deep black base plus a soft gold rim, so these feel like the
 *  "heavy hitter" cards in the deck rather than a plain flat-black card. */
export const WILD_DRAW_CARD_BG =
  'linear-gradient(125deg, rgba(255,214,122,0.35) 0%, rgba(255,214,122,0.08) 22%, rgba(255,214,122,0) 40%), ' +
  'radial-gradient(120% 90% at 15% 0%, rgba(255,225,160,0.18) 0%, rgba(255,225,160,0) 55%), ' +
  'linear-gradient(155deg, #1c1a14 0%, #0d0c09 45%, #000000 100%)';
export const WILD_DRAW_CARD_BORDER = 'border-amber-300/70';

export const CARD_ACCENT_HEX: Record<string, string> = {
  RED: '#dc2626',
  YELLOW: '#d97706',
  GREEN: '#059669',
  BLUE: '#2563eb',
};

export const CARD_GLOW_CLASSES: Record<string, string> = {
  RED: 'shadow-red-500/60',
  YELLOW: 'shadow-amber-400/60',
  GREEN: 'shadow-emerald-500/60',
  BLUE: 'shadow-blue-500/60',
};