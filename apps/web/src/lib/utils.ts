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

/** Colorless Wild / Wild Draw Four: a 4-way pie so the card itself telegraphs "any color". */
export const WILD_CARD_BG =
  'conic-gradient(from 0deg, #dc2626 0deg 90deg, #d97706 90deg 180deg, #059669 180deg 270deg, #2563eb 270deg 360deg)';
export const WILD_CARD_BORDER = 'border-zinc-900';

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