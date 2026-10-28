'use client';

import { useEffect } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { Card } from '@cma/shared';
import { playCardSound } from '@/lib/sfx';

interface Props {
  card: Card | null;
}

const EFFECT_CONFIG: Record<string, { label: string; emoji: string; bg: string; ring: string }> = {
  SKIP: { label: 'ข้ามตา!', emoji: '\u{1F6AB}', bg: 'from-red-600/95 to-red-900/95', ring: 'ring-red-300/50' },
  REVERSE: { label: 'กลับทิศ!', emoji: '\u{1F501}', bg: 'from-indigo-600/95 to-purple-900/95', ring: 'ring-indigo-300/50' },
  DRAW_TWO: { label: '+2 จั่วเพิ่ม!', emoji: '\u270B', bg: 'from-orange-600/95 to-red-900/95', ring: 'ring-orange-300/50' },
  WILD: { label: 'เปลี่ยนสี!', emoji: '\u{1F3A8}', bg: 'from-pink-600/95 via-purple-600/95 to-blue-600/95', ring: 'ring-white/50' },
  WILD_DRAW_TWO: { label: 'เปลี่ยนสี +2!', emoji: '\u{1F300}', bg: 'from-pink-600/95 via-purple-700/95 to-orange-700/95', ring: 'ring-white/50' },
  WILD_DRAW_FOUR: { label: '+4 สุดแรง!', emoji: '\u{1F4A5}', bg: 'from-pink-600/95 via-purple-700/95 to-red-700/95', ring: 'ring-white/50' },
  WILD_DRAW_EIGHT: { label: '+8 จัดเต็ม!!', emoji: '\u{1F525}', bg: 'from-fuchsia-600/95 via-purple-800/95 to-black/95', ring: 'ring-amber-300/60' },
};

const emoClass = (k: string) =>
  k === 'REVERSE' ? 'fx-emo-REVERSE' : k === 'SKIP' ? 'fx-emo-SKIP' : k.startsWith('WILD') ? 'fx-emo-WILD' : 'fx-emo-POP';

/**
 * A full-screen celebratory banner that flashes whenever an Action/Wild card lands on the
 * discard pile — gives SKIP/REVERSE/DRAW_TWO/WILD/WILD_DRAW_FOUR the "oomph" plain number cards
 * don't need. Caller is responsible for clearing `card` back to null after ~1.2-1.5s.
 */
export function ActionEffect({ card }: Props) {
  const config = card ? EFFECT_CONFIG[card.kind] : undefined;

  // Fire the synthesized SFX exactly once per card (keyed by card.id, same card that mounts the banner).
  useEffect(() => {
    if (card && config) playCardSound(card.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  return (
    <AnimatePresence>
      {card && config && (
        <m.div
          key={card.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none px-4"
        >
          {/* dim backdrop flash */}
          <div className="fx-flash absolute inset-0 bg-black" />
          <div className={`fx-banner-in px-10 py-7 rounded-3xl bg-gradient-to-br ${config.bg} shadow-2xl ring-4 ${config.ring} border-2 border-white/40 text-center`}>
            <div className={`text-6xl mb-2 drop-shadow-lg ${emoClass(card.kind)}`}>{config.emoji}</div>
            <div className="fx-rise-in text-2xl font-black text-white drop-shadow-lg tracking-wide whitespace-nowrap">{config.label}</div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
