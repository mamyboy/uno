'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';

/** Arrow between two seats, pointing the way play travels. It physically flips (spins 180°)
 *  whenever the direction is reversed, and pulses so the flow is obvious. */
export function SeatArrow({ direction, size = 'sm' }: { direction: 'LEFT' | 'RIGHT' | null; size?: 'sm' | 'lg' }) {
  if (!direction) return null;
  const left = direction === 'LEFT';
  const dim = size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <motion.span
      className={`relative inline-flex shrink-0 items-center justify-center self-center ${dim}`}
      initial={false}
      animate={{ rotate: left ? 180 : 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      aria-label={left ? 'ทิศทางไปทางซ้าย' : 'ทิศทางไปทางขวา'}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="w-full h-full drop-shadow-[0_0_6px_rgba(52,211,153,0.9)]"
        animate={{ x: [-2, 3, -2], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M3 12 H17" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round" />
        <path d="M12 5 L20 12 L12 19" fill="none" stroke="#34d399" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </motion.svg>
    </motion.span>
  );
}

/** Chip at the end of the row showing who the turn wraps around to. */
export function SeatWrap({ direction, toName, size = 'sm' }: { direction: 'LEFT' | 'RIGHT' | null; toName: string; size?: 'sm' | 'lg' }) {
  if (!direction) return null;
  return (
    <motion.span
      key={direction}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`shrink-0 self-center inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 ${
        size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      <motion.span animate={{ rotate: direction === 'RIGHT' ? [0, 360] : [0, -360] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} className="inline-block">
        {direction === 'RIGHT' ? '↻' : '↺'}
      </motion.span>
      วนต่อที่ {toName}
    </motion.span>
  );
}

/** Brief banner whenever the direction flips (not on first render). */
export function DirectionFlipFlash({ direction }: { direction: 'LEFT' | 'RIGHT' | null }) {
  const prev = useRef(direction);
  const [flip, setFlip] = useState(0);
  useEffect(() => {
    if (prev.current && direction && prev.current !== direction) setFlip((n) => n + 1);
    prev.current = direction;
  }, [direction]);
  useEffect(() => {
    if (!flip) return;
    const t = setTimeout(() => setFlip(0), 1700);
    return () => clearTimeout(t);
  }, [flip]);
  if (!flip || !direction) return null;
  return (
    <motion.div
      key={flip}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 0.9] }}
      transition={{ duration: 1.6, times: [0, 0.2, 0.75, 1] }}
      className="pointer-events-none absolute left-1/2 -top-3 -translate-x-1/2 z-20 whitespace-nowrap rounded-full bg-emerald-500/95 px-4 py-1 text-sm font-black text-white shadow-lg"
    >
      🔄 กลับทิศ! ตอนนี้ไปทาง{direction === 'LEFT' ? 'ซ้าย ⟲' : 'ขวา ⟳'}
    </motion.div>
  );
}

/** Seat strip: wraps onto new lines when crowded (centered). */
export function SeatRow({ children, className = '' }: { children: ReactNode; currentId?: string | null; className?: string }) {
  return <div className={`flex flex-wrap justify-center ${className}`}>{children}</div>;
}

/** Badge on the avatar of whoever plays next. */
export function NextBadge({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <motion.span
      className={`absolute left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-full bg-amber-400 text-black font-black shadow-[0_0_12px_rgba(251,191,36,0.9)] ${
        size === 'lg' ? '-top-4 px-2.5 py-0.5 text-xs' : '-top-3 px-1.5 py-[1px] text-[9px]'
      }`}
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 0.8, repeat: Infinity }}
    >
      ถัดไป ▼
    </motion.span>
  );
}

/** Clear "now → next" strip so it's obvious who plays after the current player. */
export function TurnFlow({ currentName, nextName, direction, size = 'sm' }: { currentName: string; nextName: string; direction: 'LEFT' | 'RIGHT' | null; size?: 'sm' | 'lg' }) {
  if (!direction || !currentName) return null;
  const big = size === 'lg';
  return (
    <div className={`mx-auto mb-3 flex w-fit max-w-full items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 ${big ? 'px-5 py-2 text-lg' : 'px-3 py-1 text-xs'}`}>
      <span className="text-zinc-400">ตอนนี้</span>
      <span className="font-black text-emerald-300 truncate max-w-[9rem]">{currentName}</span>
      <SeatArrow direction="RIGHT" size={size} />
      <span className="text-zinc-400">ถัดไป</span>
      <span className="font-black text-amber-300 truncate max-w-[9rem]">{nextName}</span>
      <span className={`text-zinc-500 ${big ? 'text-sm' : 'text-[10px]'}`}>({direction === 'LEFT' ? 'ทวนเข็ม ⟲' : 'ตามเข็ม ⟳'})</span>
    </div>
  );
}
