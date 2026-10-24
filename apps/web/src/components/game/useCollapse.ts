'use client';

import { useEffect, useState } from 'react';

/** Open/closed state remembered per device (localStorage). */
export function useCollapse(key: string, defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setOpen(v === '1');
    } catch { /* ignore */ }
  }, [key]);
  const toggle = () =>
    setOpen((o) => {
      try { localStorage.setItem(key, o ? '0' : '1'); } catch { /* ignore */ }
      return !o;
    });
  return [open, toggle] as const;
}
