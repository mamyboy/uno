'use client';

import { motion } from 'motion/react';
import { cn, CARD_COLOR_CLASSES, CARD_ACCENT_HEX, WILD_CARD_BG, WILD_CARD_BORDER } from '@/lib/utils';
import type { Card } from '@cma/shared';

interface Props {
  card: Card;
  playable?: boolean;
  selected?: boolean;
  faceDown?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'w-10 h-14 sm:w-12 sm:h-16', big: 'text-lg sm:text-xl', mid: 'text-sm', corner: 'text-[8px] sm:text-[9px]' },
  md: { box: 'w-12 h-[4.5rem] sm:w-16 sm:h-24', big: 'text-2xl sm:text-3xl', mid: 'text-lg', corner: 'text-[9px] sm:text-[10px]' },
  lg: { box: 'w-16 h-24 sm:w-24 sm:h-36', big: 'text-3xl sm:text-5xl', mid: 'text-xl sm:text-2xl', corner: 'text-xs sm:text-sm' },
};

/** Compact Unicode glyph for the corner pips — crisper and more consistent across OSes than emoji. */
function cornerGlyph(card: Card): string {
  switch (card.kind) {
    case 'SKIP':
      return '\u29B8'; // ⦸ circled reverse slash
    case 'REVERSE':
      return '\u21C4'; // ⇄
    case 'DRAW_TWO':
      return '+2';
    case 'WILD':
      return '\u2726'; // ✦
    case 'WILD_DRAW_TWO':
      return '+2';
    case 'WILD_DRAW_FOUR':
      return '+4';
    default:
      return String(card.value ?? '');
  }
}

/** Hand-drawn SVG icon for the big center badge — replaces low-fidelity emoji with crisp vector art. */
function CardIcon({ card, accent }: { card: Card; accent: string }) {
  switch (card.kind) {
    case 'SKIP':
      return (
        <svg viewBox="0 0 100 100" className="w-[64%] h-[64%]" fill="none">
          <circle cx="50" cy="50" r="38" stroke={accent} strokeWidth="13" />
          <line x1="23" y1="23" x2="77" y2="77" stroke={accent} strokeWidth="13" strokeLinecap="round" />
        </svg>
      );
    case 'REVERSE':
      return (
        <svg viewBox="0 0 100 100" className="w-[70%] h-[70%]" fill="none">
          <path
            d="M 78 38 A 32 32 0 0 0 30 22"
            stroke={accent}
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path d="M 30 22 L 18 10 M 30 22 L 38 36" stroke={accent} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path
            d="M 22 62 A 32 32 0 0 0 70 78"
            stroke={accent}
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path d="M 70 78 L 82 90 M 70 78 L 62 64" stroke={accent} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'WILD':
      return <WildPinwheel size="70%" />;
    case 'WILD_DRAW_TWO':
      return (
        <div className="relative flex items-center justify-center w-[76%] h-[76%]">
          <WildPinwheel size="100%" dim />
          <span className="absolute text-2xl font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">+2</span>
        </div>
      );
    case 'WILD_DRAW_FOUR':
      return (
        <div className="relative flex items-center justify-center w-[76%] h-[76%]">
          <WildPinwheel size="100%" dim />
          <span className="absolute text-2xl font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">+4</span>
        </div>
      );
    case 'DRAW_TWO':
      return (
        <div className="relative flex items-center justify-center w-full h-full">
          <div
            className="absolute w-[34%] h-[52%] rounded-md border-2 opacity-40 -translate-x-2 -translate-y-1 rotate-[-8deg]"
            style={{ borderColor: accent, background: `${accent}22` }}
          />
          <div
            className="absolute w-[34%] h-[52%] rounded-md border-2 opacity-70 translate-x-2 translate-y-1 rotate-[8deg]"
            style={{ borderColor: accent, background: `${accent}22` }}
          />
          <span className="relative text-3xl font-black" style={{ color: accent }}>
            +2
          </span>
        </div>
      );
    default:
      return null;
  }
}

/** Four-color pinwheel used for Wild / Wild Draw Four — a simple original mark, not a copy of any logo. */
function WildPinwheel({ size, dim }: { size: string; dim?: boolean }) {
  const colors = ['#ef4444', '#eab308', '#22c55e', '#3b82f6'];
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className={dim ? 'opacity-55' : undefined}>
      {colors.map((c, i) => (
        <path
          key={c}
          d="M 50 50 L 50 6 A 44 44 0 0 1 94 50 Z"
          fill={c}
          transform={`rotate(${i * 90} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="14" fill="white" />
    </svg>
  );
}

export function PlayingCard({ card, playable, selected, faceDown, onClick, size = 'md', className }: Props) {
  const dims = SIZES[size];

  if (faceDown) {
    return (
      <div
        className={cn(
          dims.box,
          'relative rounded-xl border-2 border-zinc-500 bg-gradient-to-br from-zinc-700 via-zinc-800 to-black shadow-lg overflow-hidden',
          className,
        )}
      >
        {/* diagonal stripe pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #fff 0, #fff 2px, transparent 2px, transparent 10px)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-emerald-500/40 border-2 border-emerald-300/60 flex items-center justify-center">
            <span className="text-[9px] font-black text-white">CMA</span>
          </div>
        </div>
      </div>
    );
  }

  const isWild = card.kind === 'WILD' || card.kind === 'WILD_DRAW_TWO' || card.kind === 'WILD_DRAW_FOUR';
  const isAction = card.kind === 'SKIP' || card.kind === 'REVERSE' || card.kind === 'DRAW_TWO' || isWild;
  const glyph = cornerGlyph(card);
  const accent = card.color ? CARD_ACCENT_HEX[card.color] ?? '#000' : '#18181b';

  // Idle motion for the center badge — subtle when just sitting in hand, livelier when playable,
  // so Skip/Reverse/Draw/Wild always feel distinct from plain number cards.
  const idleScale = playable ? 1 : 0.6;
  const glyphAnimate =
    card.kind === 'REVERSE'
      ? { rotate: [0, 360] }
      : card.kind === 'SKIP'
        ? { rotate: [0, -8 * idleScale, 8 * idleScale, 0] }
        : card.kind === 'DRAW_TWO'
          ? { scale: [1, 1 + 0.08 * idleScale, 1] }
          : isWild
            ? { rotate: [0, 360] }
            : undefined;
  const glyphTransition =
    card.kind !== 'NUMBER'
      ? {
          duration: card.kind === 'REVERSE' ? 2.2 : isWild ? 5 : 1.6,
          repeat: Infinity,
          ease: isWild ? ('linear' as const) : ('easeInOut' as const),
        }
      : undefined;

  const cardAnimate = {
    opacity: 1,
    y: playable ? -6 : 0,
    rotate: 0,
    scale: selected ? 1.08 : 1,
    ...(isWild
      ? {
          boxShadow: [
            '0 0 14px 2px rgba(220,38,38,0.55)',
            '0 0 14px 2px rgba(217,119,6,0.55)',
            '0 0 14px 2px rgba(5,150,105,0.55)',
            '0 0 14px 2px rgba(37,99,235,0.55)',
            '0 0 14px 2px rgba(220,38,38,0.55)',
          ],
        }
      : {}),
  };
  const cardTransition = isWild
    ? { default: { type: 'spring' as const, stiffness: 400, damping: 26 }, boxShadow: { duration: 4, repeat: Infinity, ease: 'linear' as const } }
    : { type: 'spring' as const, stiffness: 400, damping: 26 };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 16, rotate: -6, scale: 0.85 }}
      animate={cardAnimate}
      whileHover={onClick ? { y: -10, scale: 1.06 } : undefined}
      whileTap={onClick ? { scale: 0.94 } : undefined}
      transition={cardTransition}
      className={cn(
        dims.box,
        'relative rounded-xl border-2 shadow-lg select-none overflow-hidden',
        isWild ? WILD_CARD_BORDER : CARD_COLOR_CLASSES[card.color ?? 'RED'],
        playable && !selected && 'ring-2 ring-white/70 cursor-pointer animate-glow-pulse',
        selected && 'ring-4 ring-yellow-300 cursor-pointer shadow-yellow-300/70',
        onClick && !playable && !selected ? 'opacity-50 cursor-not-allowed' : '',
        !onClick ? 'cursor-default' : '',
        className,
      )}
      style={isWild ? { backgroundImage: WILD_CARD_BG } : undefined}
    >
      {/* glossy highlight */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/35 via-transparent to-black/20 pointer-events-none" />

      {/* action-card sheen sweep — a slow diagonal light pass, only on non-number cards */}
      {isAction && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)',
          }}
          initial={{ x: '-120%' }}
          animate={{ x: '120%' }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
        />
      )}

      {/* corner pips */}
      <span className={cn(dims.corner, 'absolute top-1 left-1.5 font-black text-white drop-shadow-sm z-10')}>{glyph}</span>
      <span className={cn(dims.corner, 'absolute bottom-1 right-1.5 font-black text-white drop-shadow-sm rotate-180 z-10')}>
        {glyph}
      </span>

      {/* center ellipse badge */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[72%] h-[82%] rounded-[50%] bg-white shadow-inner flex items-center justify-center overflow-hidden"
          style={{ transform: 'rotate(-14deg)' }}
        >
          {card.kind === 'NUMBER' ? (
            <span className={cn(dims.big, 'font-black drop-shadow-sm')} style={{ color: accent, transform: 'rotate(14deg)' }}>
              {card.value}
            </span>
          ) : (
            <motion.div
              className="flex items-center justify-center w-full h-full"
              style={{ transform: 'rotate(14deg)' }}
              animate={glyphAnimate}
              transition={glyphTransition}
            >
              <CardIcon card={card} accent={accent} />
            </motion.div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
