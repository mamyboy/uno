'use client';

import { motion } from 'motion/react';
import { cn, CARD_COLOR_CLASSES, CARD_ACCENT_HEX, WILD_CARD_BG, WILD_CARD_BORDER, WILD_DRAW_CARD_BG, WILD_DRAW_CARD_BORDER } from '@/lib/utils';
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
  sm: { box: 'w-10 h-14 sm:w-12 sm:h-16', big: 'text-lg sm:text-xl', mid: 'text-sm', corner: 'text-[10px] sm:text-[11px]', cornerIcon: 'w-2 h-2 sm:w-2.5 sm:h-2.5' },
  md: { box: 'w-12 h-[4.5rem] sm:w-16 sm:h-24', big: 'text-2xl sm:text-3xl', mid: 'text-lg', corner: 'text-xs sm:text-sm', cornerIcon: 'w-2.5 h-2.5 sm:w-3 sm:h-3' },
  lg: { box: 'w-16 h-24 sm:w-24 sm:h-36', big: 'text-3xl sm:text-5xl', mid: 'text-xl sm:text-2xl', corner: 'text-sm sm:text-base', cornerIcon: 'w-3 h-3 sm:w-3.5 sm:h-3.5' },
};

/** Black 4-direction outline behind white corner-pip text so numbers stay legible on any card
 *  color, including bright YELLOW where plain white text nearly disappears. */
const CORNER_TEXT_OUTLINE = {
  textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px rgba(0,0,0,0.6)',
};

/** Compact corner pip text — only number/draw cards show text in the corner; action icons
 *  (Skip/Reverse/Wild) get a small matching SVG instead (rendered via <CornerIcon>) so every
 *  card type is instantly recognizable even at a glance, just like a real printed UNO deck. */
function cornerText(card: Card): string {
  switch (card.kind) {
    case 'DRAW_TWO':
    case 'WILD_DRAW_TWO':
      return '+2';
    case 'WILD_DRAW_FOUR':
      return '+4';
    case 'WILD_DRAW_EIGHT':
      return '+8';
    default:
      return String(card.value ?? '');
  }
}

/** Tiny corner-sized version of the Skip / Reverse / Wild badge, rendered in white so it reads
 *  clearly against the colored card background (matches the small corner pips on a real deck). */
function CornerIcon({ card }: { card: Card }) {
  switch (card.kind) {
    case 'SKIP':
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
          <circle cx="50" cy="50" r="38" stroke="white" strokeWidth="16" />
          <line x1="23" y1="23" x2="77" y2="77" stroke="white" strokeWidth="16" strokeLinecap="round" />
        </svg>
      );
    case 'REVERSE':
      return <ReverseArrows fill="white" />;
    case 'WILD':
      return <WildPinwheel size="100%" />;
    default:
      return null;
  }
}

/** Official-style Reverse symbol: two thick chevron arrows pointing opposite directions,
 *  stacked top/bottom — the real printed-deck mark, not an abstract "refresh" swirl. */
function ReverseArrows({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="6,22 62,22 62,8 96,32 62,56 62,42 6,42" fill={fill} />
      <polygon points="94,58 38,58 38,44 4,68 38,92 38,78 94,78" fill={fill} />
    </svg>
  );
}

/** The "+N" number is the hero — big, bold, high-contrast, sitting on top of a clean
 *  2x2 color swatch grid (red/blue/yellow/green) so the card reads instantly as
 *  "Wild Draw +N" without any overlap or clutter. */
function WildDrawBadge({ label }: { label: string }) {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* 2x2 color swatch grid as background */}
      <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-0.5 p-1">
        {['#ef4444', '#3b82f6', '#eab308', '#22c55e'].map((c) => (
          <span
            key={c}
            className="w-1/2 h-1/2 sm:w-8 sm:h-8 rounded-[6px]"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {/* Large +N number on top — white text, thick black stroke for maximum contrast on any color */}
      <span
        className="relative z-10 text-4xl sm:text-5xl font-black leading-none select-none"
        style={{
          color: 'white',
          textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 8px rgba(0,0,0,0.8)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Four-petal color pinwheel used for every Wild-family card — curved teardrop petals meeting
 *  at the center, like the real card's mark (not geometric pie-slice triangles). */
function WildPinwheel({ size }: { size: string }) {
  const colors = ['#ef4444', '#eab308', '#22c55e', '#3b82f6'];
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
      {colors.map((c, i) => (
        <path
          key={c}
          d="M 50 50 C 32 50 26 24 50 4 C 74 24 68 50 50 50 Z"
          fill={c}
          transform={`rotate(${i * 90} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="12" fill="white" />
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

  const isWild = card.kind === 'WILD' || card.kind === 'WILD_DRAW_TWO' || card.kind === 'WILD_DRAW_FOUR' || card.kind === 'WILD_DRAW_EIGHT';
  const isWildDraw = card.kind === 'WILD_DRAW_TWO' || card.kind === 'WILD_DRAW_FOUR' || card.kind === 'WILD_DRAW_EIGHT';
  const isPureWild = card.kind === 'WILD'; // only the plain Wild spins its pinwheel — the draw
  // variants show a static premium gold badge, which would be unreadable while spinning.
  const isAction = card.kind === 'SKIP' || card.kind === 'REVERSE' || card.kind === 'DRAW_TWO' || isWild;
  const hasCornerIcon = card.kind === 'SKIP' || card.kind === 'REVERSE' || card.kind === 'WILD';
  const cornerLabel = cornerText(card);
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
          : isPureWild
            ? { rotate: [0, 360] }
            : card.kind === 'WILD_DRAW_TWO' || card.kind === 'WILD_DRAW_FOUR' || card.kind === 'WILD_DRAW_EIGHT'
              ? { scale: [1, 1 + 0.06 * idleScale, 1] }
              : undefined;
  const glyphTransition =
    card.kind !== 'NUMBER'
      ? {
          duration: card.kind === 'REVERSE' ? 2.2 : isPureWild ? 5 : 1.6,
          repeat: Infinity,
          ease: isPureWild ? ('linear' as const) : ('easeInOut' as const),
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
        isWildDraw ? WILD_DRAW_CARD_BORDER : isWild ? WILD_CARD_BORDER : CARD_COLOR_CLASSES[card.color ?? 'RED'],
        playable && !selected && 'ring-2 ring-white/70 cursor-pointer animate-glow-pulse',
        selected && 'ring-4 ring-yellow-300 cursor-pointer shadow-yellow-300/70',
        onClick && !playable && !selected ? 'opacity-50 cursor-not-allowed' : '',
        !onClick ? 'cursor-default' : '',
        className,
      )}
      style={isWildDraw ? { backgroundImage: WILD_DRAW_CARD_BG } : isWild ? { backgroundImage: WILD_CARD_BG } : undefined}
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
      {hasCornerIcon ? (
        <>
          <span className={cn(dims.cornerIcon, 'absolute top-1 left-1.5 z-10 drop-shadow-sm')}>
            <CornerIcon card={card} />
          </span>
          <span className={cn(dims.cornerIcon, 'absolute bottom-1 right-1.5 z-10 rotate-180 drop-shadow-sm')}>
            <CornerIcon card={card} />
          </span>
        </>
      ) : (
        <>
          <span className={cn(dims.corner, 'absolute top-1 left-1.5 font-black text-white z-10')} style={CORNER_TEXT_OUTLINE}>
            {cornerLabel}
          </span>
          <span className={cn(dims.corner, 'absolute bottom-1 right-1.5 font-black text-white rotate-180 z-10')} style={CORNER_TEXT_OUTLINE}>
            {cornerLabel}
          </span>
        </>
      )}

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

/** Hand-drawn SVG icon for the big center badge — matches a real printed UNO deck:
 *  Skip = no-entry circle, Reverse = the two chasing chevron arrows, plain Wild = the
 *  four-petal color pinwheel. The Draw-family wilds (+2/+4/+8) get a premium metallic-gold
 *  treatment instead — a smaller dimmed pinwheel sitting behind a bold gold-foil number, so the
 *  number itself reads as the "heavy hitter" badge rather than competing with the colors. */
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
        <div className="w-[76%] h-[76%]">
          <ReverseArrows fill={accent} />
        </div>
      );
    case 'WILD':
      return <WildPinwheel size="80%" />;
    case 'WILD_DRAW_TWO':
      return <WildDrawBadge label="+2" />;
    case 'WILD_DRAW_FOUR':
      return <WildDrawBadge label="+4" />;
    case 'WILD_DRAW_EIGHT':
      return <WildDrawBadge label="+8" />;
    case 'DRAW_TWO':
      return (
        <span className="relative text-5xl font-black" style={{ color: accent }}>
          +2
        </span>
      );
    default:
      return null;
  }
}