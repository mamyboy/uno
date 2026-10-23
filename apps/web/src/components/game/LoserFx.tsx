'use client';

import { motion } from 'motion/react';

export type LoserInfo = { key: string; name: string; avatar?: string | null; cardsLeft: number; variant: number; tease: string };

/** Each style = a different entrance motion, backdrop, mascot emoji, palette and sound. */
export const LOSER_VARIANTS = [
  { id: 'drop', emoji: '🤪', sound: 'spongebob-fail', bg: 'bg-black/40', ring: 'conic-gradient(#f0abfc, #fde047, #a3e635, #f472b6, #f0abfc)', text: 'from-pink-300 via-yellow-200 to-lime-300', stroke: '#a21caf' },
  { id: 'tornado', emoji: '🌀', sound: 'sound-fail-fallo', bg: 'bg-indigo-950/60', ring: 'conic-gradient(#60a5fa, #a78bfa, #22d3ee, #60a5fa)', text: 'from-cyan-200 via-sky-300 to-violet-300', stroke: '#1e3a8a' },
  { id: 'rain', emoji: '😭', sound: 'tf-nemesis', bg: 'bg-slate-900/75', ring: 'conic-gradient(#94a3b8, #cbd5e1, #64748b, #94a3b8)', text: 'from-slate-100 via-sky-200 to-slate-400', stroke: '#0f172a' },
  { id: 'damage', emoji: '💔', sound: 'emotional-damage-meme', bg: 'bg-red-950/60', ring: 'conic-gradient(#ef4444, #f97316, #dc2626, #ef4444)', text: 'from-red-200 via-orange-300 to-red-500', stroke: '#450a0a' },
  { id: 'oof', emoji: '💀', sound: 'roblox-death-sound-1', bg: 'bg-black/55', ring: 'conic-gradient(#e5e7eb, #9ca3af, #f9fafb, #e5e7eb)', text: 'from-white via-zinc-200 to-zinc-400', stroke: '#18181b' },
  { id: 'laugh', emoji: '😹', sound: 'cat-laugh-meme-1', bg: 'bg-amber-950/50', ring: 'conic-gradient(#fde047, #fb923c, #facc15, #fde047)', text: 'from-yellow-100 via-amber-300 to-orange-400', stroke: '#78350f' },
  { id: 'fart', emoji: '🤢', sound: 'dry-fart', bg: 'bg-lime-950/55', ring: 'conic-gradient(#a3e635, #84cc16, #bef264, #a3e635)', text: 'from-lime-200 via-green-300 to-emerald-400', stroke: '#1a2e05' },
  { id: 'error', emoji: '🖥️', sound: 'error-cdoxcym', bg: 'bg-blue-950/70', ring: 'conic-gradient(#3b82f6, #1d4ed8, #93c5fd, #3b82f6)', text: 'from-white via-blue-200 to-blue-400', stroke: '#172554' },
] as const;

export const LOSER_TEASES = [
  'ไปฝึกมาใหม่นะ 🤭',
  'ถือไพ่เยอะจนจะเปิดร้านได้แล้ว 🏪',
  'เกิดมาเพื่อจั่วไพ่ 🃏',
  'วันนี้ดวงไม่เข้าข้างเลยจริงๆ 🍀❌',
  'เก่งมาก... ในการแพ้ 👏',
  'ครั้งหน้าลองลงไพ่ดูบ้างนะ 😅',
  'ไพ่ในมือหนักกว่ากระเป๋าตังค์ 💸',
  'ขอบคุณที่มาเป็นสีสันให้เพื่อนๆ 🌈',
  'พรุ่งนี้ค่อยเอาคืนนะ 555 😂',
  'แพ้ไม่เป็นไร แต่แพ้บ่อยนี่สิ 🤔',
  'ตำแหน่งนี้จองไว้ให้แล้ว ประจำเลย 🪑',
  'มือขวาหรือมือซ้ายที่ทำแพ้เนี่ย 🫳',
  'เทพแห่งการจั่วไพ่มาเอง 🙇',
  'ไม่ได้แพ้ แค่ชนะช้าที่สุด 🐢',
];

/** Small stable hash so every screen in the room picks the same style/tease for a match. */
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function Avatar({ loser, emoji, ring }: { loser: LoserInfo; emoji: string; ring: string }) {
  return (
    <div className="relative mx-auto w-36 h-36 sm:w-44 sm:h-44">
      <motion.div className="absolute -inset-3 rounded-full" style={{ background: ring }} animate={{ rotate: 360 }} transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }} />
      {loser.avatar ? (
        <img src={loser.avatar} alt={loser.name} className="relative w-full h-full rounded-full object-cover border-4 border-white shadow-[0_10px_40px_rgba(0,0,0,0.6)]" />
      ) : (
        <div className="relative w-full h-full rounded-full border-4 border-white bg-gradient-to-br from-fuchsia-500 to-purple-800 flex items-center justify-center text-6xl sm:text-7xl font-black text-white shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          {loser.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <motion.span className="absolute -bottom-2 -right-2 text-5xl" animate={{ scale: [1, 1.3, 1], rotate: [0, 20, -20, 0] }} transition={{ duration: 0.7, repeat: Infinity }}>
        {emoji}
      </motion.span>
    </div>
  );
}

/** Entrance/idle motion per variant, applied to the whole avatar+name block. */
function entrance(id: string) {
  switch (id) {
    case 'tornado':
      return { initial: { scale: 0, rotate: -1080, opacity: 0 }, animate: { scale: 1, rotate: 0, opacity: 1 }, transition: { duration: 1.2, ease: 'easeOut' as const } };
    case 'rain':
      return { initial: { y: 40, opacity: 0, filter: 'grayscale(1) blur(6px)' }, animate: { y: 0, opacity: 1, filter: 'grayscale(0.6) blur(0px)' }, transition: { duration: 1.6, ease: 'easeOut' as const } };
    case 'damage':
      return { initial: { scale: 4, opacity: 0 }, animate: { scale: 1, opacity: 1, x: [0, -14, 12, -10, 8, -4, 0] }, transition: { duration: 0.7 } };
    case 'oof':
      return { initial: { x: '-120vw', rotate: -720 }, animate: { x: 0, rotate: 0, y: [0, -80, 0, -30, 0, -8, 0] }, transition: { duration: 1.4, ease: 'easeOut' as const } };
    case 'laugh':
      return { initial: { scale: 0.2, opacity: 0 }, animate: { scale: [0.2, 1.15, 0.95, 1.05, 1], opacity: 1, rotate: [0, -5, 5, -3, 0] }, transition: { duration: 1 } };
    case 'fart':
      return { initial: { y: '60vh', opacity: 0 }, animate: { y: 0, opacity: 1, scaleY: [1, 0.85, 1.1, 0.95, 1] }, transition: { duration: 1.1, ease: 'easeOut' as const } };
    case 'error':
      return { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: [0, 1, 0.3, 1, 0.6, 1], x: [0, 6, -6, 3, 0], skewX: [0, 12, -10, 4, 0] }, transition: { duration: 0.8 } };
    default: // drop
      return { initial: { y: -400, rotate: -30, scale: 0.6 }, animate: { y: 0, rotate: [0, -8, 8, -5, 5, 0], scale: 1 }, transition: { y: { type: 'spring' as const, stiffness: 160, damping: 10 }, rotate: { delay: 0.5, duration: 1.2, repeat: 2 } } };
  }
}

function Backdrop({ id }: { id: string }) {
  if (id === 'rain')
    return (
      <>
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.span key={i} className="absolute top-0 w-[2px] h-6 bg-sky-200/60 rounded" style={{ left: `${(i * 37) % 100}%` }} initial={{ y: -40 }} animate={{ y: '110vh' }} transition={{ duration: 0.9 + (i % 5) * 0.15, repeat: Infinity, delay: (i % 10) * 0.12, ease: 'linear' }} />
        ))}
      </>
    );
  if (id === 'tornado')
    return (
      <motion.div className="absolute w-[120vmin] h-[120vmin] rounded-full opacity-40" style={{ background: 'repeating-conic-gradient(rgba(147,197,253,0.5) 0deg 10deg, transparent 10deg 25deg)' }} animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
    );
  if (id === 'damage')
    return (
      <>
        <motion.div className="absolute inset-0 bg-red-600" initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 0.8 }} />
        <svg className="absolute inset-0 w-full h-full opacity-70" viewBox="0 0 100 100" preserveAspectRatio="none">
          <motion.path d="M50 0 L46 20 L55 32 L44 50 L58 66 L47 82 L52 100" stroke="#fff" strokeWidth="0.6" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.3 }} />
          <motion.path d="M0 40 L20 44 L32 38 L44 50 L60 46 L78 54 L100 50" stroke="#fff" strokeWidth="0.5" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.45 }} />
        </svg>
      </>
    );
  if (id === 'laugh')
    return (
      <>
        {Array.from({ length: 14 }).map((_, i) => (
          <motion.span key={i} className="absolute text-4xl" style={{ left: '50%', top: '50%' }} animate={{ x: Math.cos((i / 14) * Math.PI * 2) * 300, y: Math.sin((i / 14) * Math.PI * 2) * 230, rotate: [0, 20, -20, 0] }} transition={{ duration: 0.8, delay: i * 0.05, rotate: { repeat: Infinity, duration: 0.5 } }}>
            {['🤣', '😂', '😹'][i % 3]}
          </motion.span>
        ))}
      </>
    );
  if (id === 'fart')
    return (
      <>
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.span key={i} className="absolute text-5xl" style={{ left: `${10 + i * 9}%`, bottom: '5%' }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.6, 2.2], y: -220 }} transition={{ duration: 2, delay: i * 0.15, repeat: 1 }}>
            💨
          </motion.span>
        ))}
      </>
    );
  if (id === 'error')
    return (
      <>
        <div className="absolute inset-0 opacity-30" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.15) 0 2px, transparent 2px 4px)' }} />
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="absolute w-64 rounded-md border border-zinc-300 bg-zinc-100 shadow-xl text-black text-xs" style={{ left: `${8 + i * 26}%`, top: `${10 + i * 22}%` }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15 * i, type: 'spring' }}>
            <div className="bg-gradient-to-r from-blue-700 to-blue-500 text-white px-2 py-1 font-bold rounded-t-md">Error</div>
            <div className="p-2">❌ player.exe หยุดทำงาน — ฝีมือไม่พบ</div>
          </motion.div>
        ))}
      </>
    );
  if (id === 'oof')
    return (
      <motion.div className="absolute text-[40vmin] opacity-10" animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 1, repeat: Infinity }}>
        💀
      </motion.div>
    );
  return null;
}

export function LoserOverlay({ loser }: { loser: LoserInfo }) {
  const v = LOSER_VARIANTS[loser.variant % LOSER_VARIANTS.length];
  const e = entrance(v.id);
  return (
    <motion.div key={loser.key} className={`fixed inset-0 z-[85] pointer-events-none flex items-center justify-center overflow-hidden ${v.bg}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Backdrop id={v.id} />
      <motion.div initial={e.initial} animate={e.animate} transition={e.transition} className="relative text-center px-6 max-w-[95vw]">
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
          <Avatar loser={loser} emoji={v.emoji} ring={v.ring} />
        </motion.div>
        <div className="mt-3 font-black leading-tight text-5xl sm:text-7xl text-white break-words" style={{ WebkitTextStroke: `2px ${v.stroke}`, textShadow: `0 6px 0 ${v.stroke}, 0 12px 30px rgba(0,0,0,0.6)` }}>
          {loser.name}
        </div>
        <motion.div
          className={`mt-2 inline-block font-black text-6xl sm:text-8xl bg-gradient-to-r ${v.text} bg-clip-text text-transparent`}
          style={{ WebkitTextStroke: `2px ${v.stroke}` }}
          animate={{ scale: [1, 1.18, 0.92, 1.1, 1], skewX: [0, -10, 10, -6, 0] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          ดุ่ยดุ้ย
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.9, type: 'spring', stiffness: 220, damping: 14 }}
          className="mt-3 mx-auto w-fit max-w-[90vw] px-5 py-2 rounded-2xl bg-black/75 border-2 border-white/40 text-white text-lg sm:text-2xl font-bold"
        >
          {loser.tease}
          {loser.cardsLeft > 0 && <div className="text-sm sm:text-base text-white/70 font-semibold mt-0.5">ค้างไพ่ไว้ในมือ {loser.cardsLeft} ใบ 🃏</div>}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
