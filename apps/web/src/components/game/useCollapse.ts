'use client';

import { useState } from 'react';

/** Open/closed panel state. Always starts at `defaultOpen` when the page opens (not remembered),
 *  so e.g. the leaderboard starts collapsed every time you enter a room. */
export function useCollapse(_key: string, defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen((o) => !o);
  return [open, toggle] as const;
}
