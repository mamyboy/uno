'use client';

/** Rough device-capability check: on low-end phones (or with OS "reduce motion") we cut particle
 *  counts, drop screen shake, and disable decorative CSS loops (html.cma-lite). */
let cached: boolean | null = null;
export function isLite(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory; // Chrome/Android only
  const cores = nav.hardwareConcurrency ?? 8;
  const iOS = /iP(hone|ad|od)/.test(nav.userAgent);
  const forced = (() => {
    try { return localStorage.getItem('cma:lite'); } catch { return null; }
  })();
  cached = forced === '1' ? true : forced === '0' ? false : reduce || (mem !== undefined && mem <= 3) || (!iOS && cores <= 4);
  return cached;
}
/** Scale a particle count for this device. */
export const fxCount = (n: number) => (isLite() ? Math.max(3, Math.round(n / 2)) : n);
/** Whether full-screen shakes are allowed. */
export const allowShake = () => !isLite();
