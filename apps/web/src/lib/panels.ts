'use client';

import { useEffect } from 'react';

/** Only one floating dock panel open at a time. */
export function announcePanel(name: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cma:panel-open', { detail: name }));
}
export function useClosesOnOtherPanel(name: string, close: () => void) {
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail !== name) close();
    };
    window.addEventListener('cma:panel-open', h);
    return () => window.removeEventListener('cma:panel-open', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
