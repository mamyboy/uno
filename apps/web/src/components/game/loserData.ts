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

