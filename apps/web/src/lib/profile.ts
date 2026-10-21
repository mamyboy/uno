/**
 * Remembered player identity — nickname and (optionally) a profile picture the user has
 * uploaded before — kept on this browser/device so returning players don't have to re-type
 * their name or re-upload their photo every time they create or join a room. Always editable:
 * every form that prefills from this still lets the player change the value before/while
 * playing, and any change is written straight back here so it carries over next time too.
 */
export interface LocalProfile {
  nickname: string;
  avatar: string | null;
}

const KEY = 'cma_profile';

export function getProfile(): LocalProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '', avatar: parsed.avatar ?? null };
  } catch {
    return null;
  }
}

/** Merges into whatever is already saved — pass only the field(s) that changed. */
export function saveProfile(update: Partial<LocalProfile>) {
  if (typeof window === 'undefined') return;
  const current = getProfile() ?? { nickname: '', avatar: null };
  const next: LocalProfile = { ...current, ...update };
  localStorage.setItem(KEY, JSON.stringify(next));
}
