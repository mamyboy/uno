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

/** Horizontal single-row seat strip: never wraps, scrolls sideways when crowded, and keeps the
 *  current player scrolled into view. */
export function SeatRow({ children, currentId, className = '' }: { children: ReactNode; currentId: string | null | undefined; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-seat="${currentId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [currentId]);
  return (
    <div ref={ref} className="w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] pb-1">
      <div className={`flex flex-nowrap w-max mx-auto ${className}`}>{children}</div>
    </div>
  );
}
