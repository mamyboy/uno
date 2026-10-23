'use client';

import { motion } from 'motion/react';

/** Animated chevrons between two seats, pointing the way play travels. */
export function SeatArrow({ direction, size = 'sm' }: { direction: 'LEFT' | 'RIGHT' | null; size?: 'sm' | 'lg' }) {
  if (!direction) return null;
  const left = direction === 'LEFT';
  const dim = size === 'lg' ? 'text-3xl' : 'text-lg';
  return (
    <span className={`relative inline-flex items-center self-center select-none ${dim} font-black text-emerald-300`} aria-label={left ? 'ทิศทางไปทางซ้าย' : 'ทิศทางไปทางขวา'}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="-mx-[0.12em] drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]"
          animate={{ opacity: [0.2, 1, 0.2], x: left ? [3, -3, 3] : [-3, 3, -3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: (left ? 2 - i : i) * 0.18 }}
        >
          {left ? '‹' : '›'}
        </motion.span>
      ))}
    </span>
  );
}

/** Small chip at the end of the row showing who the turn wraps around to. */
export function SeatWrap({ direction, toName, size = 'sm' }: { direction: 'LEFT' | 'RIGHT' | null; toName: string; size?: 'sm' | 'lg' }) {
  if (!direction) return null;
  return (
    <span
      className={`self-center inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 ${
        size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      <motion.span animate={{ rotate: direction === 'RIGHT' ? [0, 360] : [0, -360] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="inline-block">
        {direction === 'RIGHT' ? '↻' : '↺'}
      </motion.span>
      วนต่อที่ {toName}
    </span>
  );
}
