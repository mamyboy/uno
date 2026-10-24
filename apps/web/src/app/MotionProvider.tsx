'use client';

import { useEffect, type ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { isLite } from '@/lib/perf';

// Animation features load in a separate chunk after first paint (smaller initial JS).
const loadFeatures = () => import('./motion-features').then((r) => r.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (isLite()) document.documentElement.classList.add('cma-lite');
  }, []);
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
