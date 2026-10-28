export type LoserInfo = { key: string; name: string; avatar?: string | null; cardsLeft: number; variant: number; tease: string; title: string };

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

/**
 * Preset: Thai teen / TikTok slang used to roast whoever finished last. `word` replaces the old
 * "ดุ่ยดุ้ย" headline, `tease` is the line underneath. Same pick on every screen per match.
 * Sources for the slang: springnews.co.th (บ้ง), LINE TODAY/INN 2024 (ขิต, ตุย/ตุยเย่, ตัวตึง),
 * Lemon8 Gen-Z lists (อ่อม, ยับแม่, พินาศ, สลายฟิล, Big L, Mid, Dead) + common gamer slang
 * (ไก่, เกลือ, อ่อนซ้อม, โดนแกง, นก). Kept playful — no slurs, nothing about looks/gender.
 */
export const LOSER_SLANG: { word: string; tease: string }[] = [
  { word: 'บ้งมาก', tease: 'เกมนี้บ้งของจริง ไม่ไหวจะเคลียร์ 🫠' },
  { word: 'ขิตแล้ว', tease: 'ขิตคาโต๊ะ เพื่อนเก็บศพด้วย ⚰️' },
  { word: 'ตุยเย่', tease: 'ตุยเย่จ้า ไปเกิดใหม่รอบหน้านะ 👻' },
  { word: 'ยับแม่!', tease: 'ยับเยินทั้งมือ ไพ่ล้นจนถือไม่ไหว 🃏' },
  { word: 'พินาศ', tease: 'พินาศสันตะปาปา ไม่เหลือชิ้นดี 💥' },
  { word: 'อ่อมไปป่ะ', tease: 'อ่อมมาก เอเนอร์จี้หายไปไหนหมด 🔋' },
  { word: 'Big L', tease: 'รับ L ก้อนใหญ่ไปเต็มๆ 🫵' },
  { word: 'ไก่อ่อน', tease: 'ไก่อ่อนสอนขัน... แต่ขันไม่ออก 🐣' },
  { word: 'เกลือของแท้', tease: 'เค็มจนเพื่อนต้องหาน้ำให้กิน 🧂' },
  { word: 'อ่อนซ้อม', tease: 'กลับไปซ้อมมาใหม่ แล้วค่อยมาเจอกัน 🏋️' },
  { word: 'โดนแกง', tease: 'โดนเพื่อนแกงจนเปื่อย อร่อยมั้ย 🍛' },
  { word: 'นกจ้า', tease: 'อุตส่าห์ลุ้น สุดท้ายก็นก 🐦' },
  { word: 'สลายฟิล', tease: 'ฟิลชนะสลายหมดในพริบตา 🫥' },
  { word: 'Mid มาก', tease: 'ฝีมือกลางๆ ค่อนไปทางล่าง 📉' },
  { word: 'ตัวถ่วง', tease: 'ตัวตึงไม่ใช่ ตัวถ่วงต่างหาก ⚓' },
  { word: 'Dead 💀', tease: 'ไพ่หมดมือทุกคน ยกเว้นเธอ 💀' },
];


/** Small stable hash so every screen in the room picks the same style/tease for a match. */
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

