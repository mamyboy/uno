/** Emoji mascots players can pick (no images — zero page weight). */
export const MASCOTS = ['🐶', '🐱', '🦊', '🐼', '🐸', '🐵', '🐷', '🐔', '🦄', '🐙', '👻', '🤖', '👽', '💩', '🦖', '🐧'] as const;
export type Mascot = (typeof MASCOTS)[number];

export type TauntMotion = 'laugh' | 'tongue' | 'cry' | 'smug' | 'sleep' | 'shock' | 'point' | 'bye' | 'dance' | 'fart';

export interface TauntDef {
  id: string;
  face: string; // reaction emoji shown next to the mascot
  text: string; // Thai teasing line in the speech bubble
  sound: string; // local clip id under /sounds/mi
  motion: TauntMotion;
}

export const TAUNTS: readonly TauntDef[] = [
  { id: 'laugh', face: '😂', text: '555 อ่อนนน', sound: 'cat-laugh-meme-1', motion: 'laugh' },
  { id: 'tongue', face: '😛', text: 'บรึ๋ยยย แบร่~', sound: 'dukdik', motion: 'tongue' },
  { id: 'cry', face: '😭', text: 'สงสารจัง (ไม่จริง)', sound: 'tf-nemesis', motion: 'cry' },
  { id: 'smug', face: '😏', text: 'ไพ่ดีอะดิ', sound: 'rizz-sound-effect', motion: 'smug' },
  { id: 'sleep', face: '😴', text: 'ช้าจัง... เล่นได้ยัง', sound: 'tununuuuu', motion: 'sleep' },
  { id: 'shock', face: '😱', text: 'เฮ้ยยย!', sound: 'vine-boom', motion: 'shock' },
  { id: 'point', face: '🫵', text: 'แกนั่นแหละ!', sound: 'fahhhhhhhhhhhhhh', motion: 'point' },
  { id: 'bye', face: '👋', text: 'บ๊ายบาย ลาก่อนนะ', sound: 'spongebob-fail', motion: 'bye' },
  { id: 'dance', face: '🕺', text: 'ชนะแน่นอน~', sound: 'spiderman-meme-song', motion: 'dance' },
  { id: 'huh', face: '🤨', text: 'งงดิ? ลงอะไรเนี่ย', sound: 'ceeday-huh-sound-effect', motion: 'shock' },
  { id: 'sorry', face: '🙏', text: 'ผมขอโทษครับพี่ (แกล้งๆ)', sound: 'phmkh-othskhrabphii', motion: 'bye' },
  { id: 'fart', face: '💨', text: 'อุ๊ปส์... ใครตด', sound: 'dry-fart', motion: 'fart' },
] as const;

export const TAUNT_IDS = TAUNTS.map((t) => t.id);
export const TAUNT_COOLDOWN_MS = 4000;

/** Push-to-talk walkie-talkie limits. */
export const VOICE_MAX_MS = 5000;
export const VOICE_COOLDOWN_MS = 8000;
export const VOICE_MAX_BYTES = 160_000;

/** Seconds a player gets to act before the server plays a random legal move for them. */
export const TURN_TIME_MS = 20_000;
