'use client';

/** Coalesces socket-driven state updates that arrive back-to-back (room + game + hand are separate
 *  messages for one move) into ONE React render on the next animation frame. */
let queue: (() => void)[] = [];
let scheduled = false;
function flush() {
  scheduled = false;
  const fns = queue;
  queue = [];
  fns.forEach((f) => f());
}
export function inFrame(fn: () => void) {
  queue.push(fn);
  if (scheduled) return;
  scheduled = true;
  if (typeof document !== 'undefined' && document.hidden) setTimeout(flush, 0);
  else requestAnimationFrame(flush);
}
