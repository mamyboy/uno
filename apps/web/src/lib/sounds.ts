'use client';

import { SOUND_IDS, SOUND_LABELS } from '@cma/shared';
import { primeSfx } from './sfx';

/**
 * Sounds come from myinstants.com's Thai index (all ~1,400 clips across every page, listed in
 * /public/sounds/catalog.json as {f: slug, t: title}). A core set used by game FX is bundled
 * locally under /sounds/mi; anything else streams straight from myinstants' media URL.
 */
const LOCAL = new Set<string>([...(SOUND_IDS as readonly string[]), 'emotional-damage-meme', 'roblox-death-sound-1', 'sound-fail-fallo', 'cat-laugh-meme-1']);
export type CatalogItem = { f: string; t: string };

export const soundUrl = (id: string) =>
  LOCAL.has(id) ? `/sounds/mi/${encodeURIComponent(id)}.mp3` : `https://www.myinstants.com/media/sounds/${encodeURIComponent(id)}.mp3`;

let catalogPromise: Promise<CatalogItem[]> | null = null;
let titles = new Map<string, string>();
export function loadCatalog(): Promise<CatalogItem[]> {
  if (!catalogPromise) {
    catalogPromise = fetch('/sounds/catalog.json')
      .then((r) => r.json() as Promise<CatalogItem[]>)
      .then((list) => {
        titles = new Map(list.map((x) => [x.f, x.t]));
        return list;
      })
      .catch(() => {
        catalogPromise = null;
        return (SOUND_IDS as readonly string[]).map((f) => ({ f, t: (SOUND_LABELS as Record<string, string>)[f] ?? f }));
      });
  }
  return catalogPromise;
}

export const soundLabel = (id: string, fallback?: string) =>
  titles.get(id) ?? (SOUND_LABELS as Record<string, string>)[id] ?? fallback ?? id;

// iOS/Safari (and some Android browsers) only allow audio started from a user gesture. Event-driven
// FX sounds (combo hits, other players' soundboard taps) aren't gestures, so on the first tap we
// "unlock" a small pool of <audio> elements by playing a silent clip; later clips reuse them.
/** Tiny valid silent WAV (8 kHz mono, 100 samples) built at runtime. */
function silentWav(): string {
  const n = 100, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return 'data:audio/wav;base64,' + btoa(bin);
}
const POOL_SIZE = 6;
let pool: HTMLAudioElement[] = [];
let poolIdx = 0;
let unlocked = false;
function unlockAudio() {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  pool = Array.from({ length: POOL_SIZE }, () => {
    const a = new Audio(silentWav());
    a.preload = 'auto';
    void a.play().then(() => a.pause()).catch(() => {});
    return a;
  });
  popPool = Array.from({ length: 4 }, () => {
    const a = new Audio(silentWav());
    a.preload = 'auto';
    void a.play().then(() => a.pause()).catch(() => {});
    return a;
  });
  try {
    // iOS: play Web Audio like media (not muted by the ring/silent switch).
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch { /* ignore */ }
  primeSfx(); // create + resume the synth's AudioContext inside this user gesture
}

// ---- "pop" when a card hits the pile: a tiny synthesized WAV played through its OWN unlocked
// <audio> pool — same path as the clips that already work everywhere (iOS silent switch, Web
// Audio contexts created outside a gesture, etc.), and never cut off by soundboard clips. ----
let popPool: HTMLAudioElement[] = [];
let popIdx = 0;
const popCache = new Map<string, string>();
function popWav(pitch: number, count: number): string {
  const key = `${pitch.toFixed(3)}:${count}`;
  const hit = popCache.get(key);
  if (hit) return hit;
  const rate = 22050;
  const one = Math.floor(rate * 0.075), gap = Math.floor(rate * 0.075);
  const n = one + gap * (count - 1);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  const samples = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const f0 = 520 * pitch * (1 + k * 0.12);
    let phase = 0;
    for (let i = 0; i < one; i++) {
      const t = i / rate;
      const f = f0 * Math.pow(2.6, t / 0.07); // quick upward chirp = "pop"
      phase += (2 * Math.PI * f) / rate;
      const env = Math.min(1, i / (rate * 0.003)) * Math.exp(-t / 0.018);
      const j = k * gap + i;
      if (j < n) samples[j] += Math.sin(phase) * env * 0.8;
    }
  }
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  let bin = '';
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  const url = 'data:audio/wav;base64,' + btoa(bin);
  popCache.set(key, url);
  return url;
}
export function playPopClip(pitch = 1, count = 1) {
  if (typeof window === 'undefined') return;
  try {
    const src = popWav(pitch, Math.max(1, Math.min(count, 4)));
    const a = popPool.length ? popPool[popIdx++ % popPool.length] : new Audio();
    a.pause();
    a.src = src;
    a.volume = 1;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
    window.removeEventListener('touchend', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
  window.addEventListener('touchend', once, true);
}

/** Fire-and-forget clip playback — never throws (autoplay policy, missing file, etc.). */
export function playClip(id: string, volume = 0.9) {
  if (typeof window === 'undefined') return;
  try {
    let a: HTMLAudioElement;
    if (pool.length) {
      a = pool[poolIdx++ % pool.length];
      a.pause();
      a.src = soundUrl(id);
    } else {
      a = new Audio(soundUrl(id));
    }
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// ---- Favorites + usage counts (per device, localStorage) ----
const FAV_KEY = 'cma:sound-favs';
const USE_KEY = 'cma:sound-usage';
const read = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return d;
  }
};
export const getFavorites = (): CatalogItem[] => read<CatalogItem[]>(FAV_KEY, []);
export function toggleFavorite(item: CatalogItem): CatalogItem[] {
  const favs = getFavorites();
  const next = favs.some((x) => x.f === item.f) ? favs.filter((x) => x.f !== item.f) : [...favs, item];
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}
export const getUsage = (): Record<string, { t: string; n: number; at: number }> => read(USE_KEY, {});
export function recordUsage(item: CatalogItem) {
  const u = getUsage();
  u[item.f] = { t: item.t, n: (u[item.f]?.n ?? 0) + 1, at: Date.now() };
  localStorage.setItem(USE_KEY, JSON.stringify(u));
}

/** Play an arbitrary URL (e.g. a voice-clip blob) through the unlocked pool. Resolves false if
 *  the browser can't play it. */
export function playUrl(url: string, volume = 1): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  try {
    let a: HTMLAudioElement;
    if (pool.length) {
      a = pool[poolIdx++ % pool.length];
      a.pause();
      a.src = url;
    } else {
      a = new Audio(url);
    }
    a.volume = volume;
    a.currentTime = 0;
    return a.play().then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Fallback decoder path (Web Audio) for formats <audio> refuses. */
let ctx: AudioContext | null = null;
export async function playBytesViaWebAudio(bytes: ArrayBuffer): Promise<boolean> {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return false;
    ctx ??= new Ctx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}
