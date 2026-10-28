'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

const reduced = () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('cma-lite'));

/**
 * FLIP: when `key` changes (e.g. seat order / hand contents), children matching `selector` that
 * moved glide from their old spot to the new one. One layout read per change (offsetLeft/Top),
 * then a Web Animations transform that runs on the compositor — unlike motion's `layout`, which
 * re-measures every child on EVERY render and animates on the main thread.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, key: string, selector: string, idAttr: string, opts: { duration?: number; easing?: string } = {}) {
  const prev = useRef<Map<string, { x: number; y: number }>>(new Map());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const next = new Map<string, { x: number; y: number }>();
    for (const el of els) next.set(el.getAttribute(idAttr) ?? '', { x: el.offsetLeft, y: el.offsetTop });
    if (!reduced() && prev.current.size) {
      for (const el of els) {
        const id = el.getAttribute(idAttr) ?? '';
        const a = prev.current.get(id);
        const b = next.get(id)!;
        if (!a) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (!dx && !dy) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
          duration: opts.duration ?? 420,
          easing: opts.easing ?? 'cubic-bezier(.2,.9,.25,1.15)',
          composite: 'add',
        });
      }
    }
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
