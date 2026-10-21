'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';

/**
 * Shared "casino chip" button styling for Color Match Arena — a felt-green primary action,
 * a gold accent for celebratory/high-value actions (start round, restart, trophy screens),
 * a glassy dark secondary, and a muted red for destructive actions. Every variant gets the
 * same pressed-chip bevel (bottom offset shadow) + a soft colored glow, and sinks by 1px on
 * press instead of just scaling, so buttons feel like physical table pieces rather than flat
 * web chrome.
 */
export type ButtonVariant = 'primary' | 'gold' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white border border-emerald-300/50 shadow-[0_3px_0_0_rgba(4,65,45,0.75),0_8px_20px_-6px_rgba(16,185,129,0.55)]',
  gold:
    'bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-950 border border-amber-200/70 shadow-[0_3px_0_0_rgba(120,72,5,0.65),0_8px_20px_-6px_rgba(245,158,11,0.6)]',
  ghost:
    'bg-zinc-800/85 hover:bg-zinc-700 text-white border border-zinc-600/60 shadow-[0_3px_0_0_rgba(0,0,0,0.45)]',
  danger:
    'bg-red-600/15 hover:bg-red-600/25 text-red-300 border border-red-600/40 shadow-[0_3px_0_0_rgba(80,10,10,0.4)]',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-8 py-4 text-base md:text-lg rounded-2xl gap-2.5',
};

const BASE =
  'relative inline-flex items-center justify-center font-bold tracking-tight transition-[transform,filter] active:translate-y-[2px] active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:translate-y-0 select-none whitespace-nowrap';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({ variant = 'primary', size = 'md', fullWidth, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.025 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      className={`${BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
}

/** Same chip styling as `Button`, for navigational CTAs that should look identical to action buttons. */
export function LinkButton({ href, variant = 'primary', size = 'md', fullWidth, className = '', children, target, rel }: LinkButtonProps) {
  return (
    <motion.div whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.97 }} className={fullWidth ? 'w-full' : 'inline-block'}>
      <Link
        href={href}
        target={target}
        rel={rel}
        className={`${BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      >
        {children}
      </Link>
    </motion.div>
  );
}
