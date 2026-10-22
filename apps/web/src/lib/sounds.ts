'use client';

import { SOUND_LABELS, type SoundId } from '@cma/shared';

/** All clips are from myinstants.com (Thailand index), bundled locally under /public/sounds/mi. */
export const soundUrl = (id: SoundId | string) => `/sounds/mi/${encodeURIComponent(id)}.mp3`;
export const soundLabel = (id: SoundId) => SOUND_LABELS[id] ?? id;

/** Fire-and-forget clip playback — never throws (autoplay policy, missing file, etc.). */
export function playClip(id: SoundId | string, volume = 0.9) {
  if (typeof window === 'undefined') return;
  try {
    const a = new Audio(soundUrl(id));
    a.volume = volume;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
