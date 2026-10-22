'use client';

import { SOUND_IDS, SOUND_LABELS } from '@cma/shared';

/**
 * Sounds come from myinstants.com's Thai index (all ~1,400 clips across every page, listed in
 * /public/sounds/catalog.json as {f: slug, t: title}). A core set used by game FX is bundled
 * locally under /sounds/mi; anything else streams straight from myinstants' media URL.
 */
const LOCAL = new Set<string>(SOUND_IDS as readonly string[]);
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

/** Fire-and-forget clip playback — never throws (autoplay policy, missing file, etc.). */
export function playClip(id: string, volume = 0.9) {
  if (typeof window === 'undefined') return;
  try {
    const a = new Audio(soundUrl(id));
    a.volume = volume;
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
