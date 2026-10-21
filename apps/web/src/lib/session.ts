export function getSession() {
  if (typeof window === 'undefined') return null;
  const str = localStorage.getItem('cma_session');
  return str ? JSON.parse(str) : null;
}

export function setSession(session: { code: string; sessionToken: string; playerId: string } | null) {
  if (typeof window === 'undefined') return;
  if (session) {
    localStorage.setItem('cma_session', JSON.stringify(session));
  } else {
    localStorage.removeItem('cma_session');
  }
}

export function removeSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('cma_session');
}