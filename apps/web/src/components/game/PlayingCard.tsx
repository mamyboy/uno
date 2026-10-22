'use client';

import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { Card } from '@cma/shared';

interface Props {
  card: Card;
  playable?: boolean;
  selected?: boolean;
  faceDown?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  stolen?: boolean;
}

const SIZES = {
  xs: 'w-8 h-12',
  sm: 'w-10 h-[3.75rem] sm:w-12 sm:h-[4.5rem]',
  md: 'w-12 h-[4.5rem] sm:w-16 sm:h-24',
  lg: 'w-16 h-24 sm:w-24 sm:h-36',
};

/** Vivid, saturated "candy" palettes — [light, mid, deep, ink]. */
const PALETTE: Record<string, [string, string, string, string]> = {
  RED: ['#ff6b6b', '#ff2d55', '#b5002b', '#9f0026'],
  YELLOW: ['#fff27a', '#ffc800', '#ff8a00', '#c25e00'],
  GREEN: ['#6dffb8', '#14d97c', '#008f55', '#006b40'],
  BLUE: ['#7cc8ff', '#2f7bff', '#2a2fd6', '#1b23a8'],
};
const WILD_COLORS = ['#ff2d55', '#ffc800', '#14d97c', '#2f7bff'];

const isWildKind = (k: Card['kind']) => k === 'WILD' || k === 'WILD_DRAW_TWO' || k === 'WILD_DRAW_FOUR' || k === 'WILD_DRAW_EIGHT';
const isWildDrawKind = (k: Card['kind']) => k === 'WILD_DRAW_TWO' || k === 'WILD_DRAW_FOUR' || k === 'WILD_DRAW_EIGHT';

function label(card: Card): string {
  switch (card.kind) {
    case 'DRAW_TWO':
    case 'WILD_DRAW_TWO':
      return '+2';
    case 'WILD_DRAW_FOUR':
      return '+4';
    case 'WILD_DRAW_EIGHT':
      return '+8';
    case 'NUMBER':
      return String(card.value ?? '');
    default:
      return '';
  }
}

/* ---------- glyphs (all drawn in a 100x150 card coordinate space) ---------- */

function SkipGlyph({ cx, cy, r, color, sw }: { cx: number; cy: number; r: number; color: string; sw: number }) {
  const d = r * 0.7;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} />
      <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </g>
  );
}

function ReverseGlyph({ cx, cy, s, color }: { cx: number; cy: number; s: number; color: string }) {
  // two chasing chevron arrows, centered at (cx,cy), scaled by s (≈ half-width)
  const k = s / 50;
  return (
    <g transform={`translate(${cx - 50 * k} ${cy - 50 * k}) scale(${k})`}>
      <polygon points="6,22 62,22 62,8 96,32 62,56 62,42 6,42" fill={color} />
      <polygon points="94,58 38,58 38,44 4,68 38,92 38,78 94,78" fill={color} />
    </g>
  );
}

function ReflectGlyph({ cx, cy, s, color }: { cx: number; cy: number; s: number; color: string }) {
  // a mirror bar with an arrow bouncing off it
  const k = s / 50;
  return (
    <g transform={`translate(${cx - 50 * k} ${cy - 50 * k}) scale(${k})`} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <line x1="82" y1="8" x2="82" y2="92" strokeWidth="9" />
      <path d="M10 22 L70 50 L10 78" strokeWidth="9" />
      <path d="M10 78 l4 -16 M10 78 l16 2" strokeWidth="9" />
    </g>
  );
}

function Pinwheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const k = r / 50;
  return (
    <g transform={`translate(${cx - 50 * k} ${cy - 50 * k}) scale(${k})`}>
      {WILD_COLORS.map((c, i) => (
        <path key={c} d="M 50 50 C 32 50 26 24 50 4 C 74 24 68 50 50 50 Z" fill={c} transform={`rotate(${i * 90} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="11" fill="#fff" />
    </g>
  );
}

/** Corner pip: small, always inside the top-left 22x30 box — never touches the center oval. */
function Corner({ card, color, flip }: { card: Card; color: string; flip?: boolean }) {
  const t = flip ? 'rotate(180 50 75)' : undefined;
  const txt = label(card);
  return (
    <g transform={t}>
      {card.kind === 'SKIP' ? (
        <SkipGlyph cx={14} cy={17} r={7} color="#fff" sw={3} />
      ) : card.kind === 'REVERSE' ? (
        <ReverseGlyph cx={14} cy={17} s={8} color="#fff" />
      ) : card.kind === 'WILD' ? (
        <Pinwheel cx={14} cy={17} r={8} />
      ) : card.kind === 'REFLECT' ? (
        <ReflectGlyph cx={14} cy={17} s={8} color="#fff" />
      ) : (
        <text
          x={14}
          y={17}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={txt.length > 1 ? 15 : 19}
          fontWeight={900}
          fill="#fff"
          stroke={color}
          strokeWidth={3.2}
          paintOrder="stroke"
          style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' }}
        >
          {txt}
        </text>
      )}
    </g>
  );
}

export function PlayingCard({ card, playable, selected, faceDown, onClick, size = 'md', className }: Props) {
  const uid = useId().replace(/[:]/g, '');
  const box = SIZES[size];

  if (faceDown) {
    return (
      <div className={cn(box, 'relative rounded-[14%/10%] shadow-lg overflow-hidden ring-1 ring-white/20', className)}>
        <svg viewBox="0 0 100 150" className="w-full h-full block">
          <defs>
            <linearGradient id={`fd-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b1055" />
              <stop offset="1" stopColor="#0b0b1e" />
            </linearGradient>
            <pattern id={`fdp-${uid}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="10" fill="rgba(255,255,255,0.05)" />
            </pattern>
          </defs>
          <rect width="100" height="150" fill={`url(#fd-${uid})`} />
          <rect width="100" height="150" fill={`url(#fdp-${uid})`} />
          <rect x="5" y="5" width="90" height="140" rx="10" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" />
          <ellipse cx="50" cy="75" rx="30" ry="44" transform="rotate(-20 50 75)" fill="#ff2d55" />
          <text x="50" y="76" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight={900} fill="#ffe14d" stroke="#5a0016" strokeWidth="3" paintOrder="stroke" transform="rotate(-20 50 75)">
            CMA
          </text>
        </svg>
      </div>
    );
  }

  const wild = isWildKind(card.kind);
  const wildDraw = isWildDrawKind(card.kind);
  const reflect = card.kind === 'REFLECT';
  const pal = card.color ? PALETTE[card.color] : null;
  const ink = pal ? pal[3] : '#111';
  const txt = label(card);
  const isAction = card.kind !== 'NUMBER';

  // Card body fill
  const bodyStops: [string, string, string] = reflect
    ? ['#f0e6ff', '#9f7bff', '#3a1d8f']
    : wild
      ? ['#2a2a35', '#121218', '#000000']
      : [pal![0], pal![1], pal![2]];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, y: 16, rotate: -6, scale: 0.85 }}
      animate={{ opacity: 1, y: playable ? -6 : 0, rotate: 0, scale: selected ? 1.08 : 1 }}
      whileHover={onClick ? { y: -12, scale: 1.07, rotate: -1.5 } : undefined}
      whileTap={onClick ? { scale: 0.94 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className={cn(
        box,
        'relative rounded-[14%/10%] select-none overflow-hidden shadow-[0_6px_14px_-4px_rgba(0,0,0,0.65)]',
        playable && !selected && 'ring-2 ring-white/80 cursor-pointer animate-glow-pulse',
        selected && 'ring-4 ring-yellow-300 cursor-pointer shadow-[0_0_24px_4px_rgba(253,224,71,0.6)]',
        onClick && !playable && !selected ? 'opacity-45 saturate-50 cursor-not-allowed' : '',
        !onClick ? 'cursor-default' : '',
        className,
      )}
      aria-label={`${card.kind} ${card.color ?? ''} ${card.value ?? ''}`}
    >
      <svg viewBox="0 0 100 150" className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`b-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={bodyStops[0]} />
            <stop offset="0.5" stopColor={bodyStops[1]} />
            <stop offset="1" stopColor={bodyStops[2]} />
          </linearGradient>
          <radialGradient id={`o-${uid}`} cx="0.4" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor={reflect ? '#e9ddff' : wild ? '#f4f4f5' : '#fff7ec'} />
          </radialGradient>
          <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6c2" />
            <stop offset="0.45" stopColor="#ffd34d" />
            <stop offset="1" stopColor="#d48a00" />
          </linearGradient>
          <linearGradient id={`h-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="0.45" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <pattern id={`p-${uid}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <circle cx="3" cy="3" r="1.3" fill="rgba(255,255,255,0.13)" />
          </pattern>
        </defs>

        {/* body */}
        <rect width="100" height="150" fill={`url(#b-${uid})`} />
        <rect width="100" height="150" fill={`url(#p-${uid})`} />
        {/* chosen color of a played wild: tinted rim so the color is obvious on the pile */}
        <rect
          x="4.5" y="4.5" width="91" height="141" rx="11"
          fill="none"
          stroke={wild && pal ? pal[1] : wildDraw ? `url(#g-${uid})` : 'rgba(255,255,255,0.9)'}
          strokeWidth={wild && pal ? 5 : 3}
        />

        {/* center oval */}
        <ellipse cx="50" cy="75" rx="31" ry="45" transform="rotate(-20 50 75)" fill={wild ? '#0d0d12' : `url(#o-${uid})`} stroke={wild ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'} strokeWidth="1.5" />

        {/* center content — sized to stay inside the oval */}
        {card.kind === 'NUMBER' && (
          <text
            x="50" y="77" textAnchor="middle" dominantBaseline="central"
            fontSize="58" fontWeight={900} fill={pal![1]} stroke={ink} strokeWidth="5" paintOrder="stroke"
            style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' }}
          >
            {txt}
          </text>
        )}
        {card.kind === 'DRAW_TWO' && (
          <text
            x="50" y="77" textAnchor="middle" dominantBaseline="central"
            fontSize="40" fontWeight={900} fill={pal![1]} stroke={ink} strokeWidth="4.5" paintOrder="stroke"
            style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' }}
          >
            +2
          </text>
        )}
        {card.kind === 'SKIP' && <SkipGlyph cx={50} cy={75} r={20} color={pal![1]} sw={8} />}
        {card.kind === 'REVERSE' && <ReverseGlyph cx={50} cy={75} s={24} color={pal![1]} />}
        {card.kind === 'WILD' && (
          <g className="animate-spin-slow" style={{ transformOrigin: '50px 75px', transformBox: 'view-box' }}>
            <Pinwheel cx={50} cy={75} r={26} />
          </g>
        )}
        {wildDraw && (
          <>
            <g opacity="0.55">
              <Pinwheel cx={50} cy={75} r={24} />
            </g>
            <text
              x="50" y="77" textAnchor="middle" dominantBaseline="central"
              fontSize="38" fontWeight={900} fill={`url(#g-${uid})`} stroke="#3b2200" strokeWidth="4" paintOrder="stroke"
              style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' }}
            >
              {txt}
            </text>
          </>
        )}
        {reflect && (
          <>
            <ReflectGlyph cx={50} cy={68} s={20} color="#5b2bd9" />
            <text x="50" y="98" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight={900} fill="#3a1d8f">
              สะท้อน
            </text>
          </>
        )}

        {/* corners */}
        <Corner card={card} color={wild ? '#000' : reflect ? '#3a1d8f' : ink} />
        <Corner card={card} color={wild ? '#000' : reflect ? '#3a1d8f' : ink} flip />

        {/* gloss */}
        <rect width="100" height="70" fill={`url(#h-${uid})`} />
      </svg>

      {/* moving sheen on action / wild / reflect cards */}
      {isAction && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%)' }}
          initial={{ x: '-130%' }}
          animate={{ x: '130%' }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
        />
      )}
    </motion.button>
  );
}
