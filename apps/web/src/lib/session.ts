/** Sessions are stored PER ROOM (`cma_session:<CODE>`) so being in one room never overwrites,
 *  resumes or leaks into another room — two tabs in two rooms work side by side. */
type Session = { code: string; sessionToken: string; playerId: string };
const key = (code: string) => `cma_session:${code.toUpperCase()}`;

export function getSession(code: string): Session | null {
  if (typeof window === 'undefined' || !code) return null;
  try {
    const str = localStorage.getItem(key(code));
    const s = str ? (JSON.parse(str) as Session) : null;
    return s && s.code?.toUpperCase() === code.toUpperCase() ? s : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null) {
  if (typeof window === 'undefined' || !session) return;
  localStorage.setItem(key(session.code), JSON.stringify(session));
  localStorage.removeItem('cma_session'); // legacy single-slot key
}

export function removeSession(code: string) {
  if (typeof window === 'undefined' || !code) return;
  localStorage.removeItem(key(code));
}
