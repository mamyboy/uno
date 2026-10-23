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

function ShieldGlyph({ cx, cy, s, color }: { cx: number; cy: number; s: number; color: string }) {
  const k = s / 50;
  return (
    <g transform={`translate(${cx - 50 * k} ${cy - 50 * k}) scale(${k})`} strokeLinejoin="round">
      <path d="M50 4 L88 18 V48 C88 72 70 88 50 96 C30 88 12 72 12 48 V18 Z" fill={color} />
      <path d="M50 16 L76 26 V48 C76 64 64 76 50 82 Z" fill="rgba(255,255,255,0.45)" />
    </g>
  );
}

function ShuffleGlyph({ cx, cy, s, color }: { cx: number; cy: number; s: number; color: string }) {
  // two crossing arrows (shuffle / swap seats)
  const k = s / 50;
  return (
    <g transform={`translate(${cx - 50 * k} ${cy - 50 * k}) scale(${k})`} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 24 H28 C50 24 50 76 72 76 H90" />
      <path d="M6 76 H28 C50 76 50 24 72 24 H90" />
      <path d="M78 12 L92 24 L78 36" />
      <path d="M78 64 L92 76 L78 88" />
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


/* ---------- premium face for colorless special cards (Reflect / Shield / Shuffle) ---------- */

type SpecialKind = 'REFLECT' | 'SHIELD' | 'SHUFFLE';
const SPECIAL_THEME: Record<SpecialKind, {
  body: [string, string, string];
  accent: string;
  glow: string;
  metal: [string, string, string, string];
  ink: string;
  title: string;
  tag: string;
}> = {
  REFLECT: {
    body: ['#2e1065', '#5b21b6', '#0c0420'],
    accent: '#ddd6fe',
    glow: '#a78bfa',
    metal: ['#ffffff', '#d4d4f7', '#8b8fb8', '#f4f3ff'],
    ink: '#2e1065',
    title: 'สะท้อนกลับ',
    tag: 'COMBO ↩ คืนคนส่ง',
  },
  SHIELD: {
    body: ['#04253f', '#0e6aa8', '#020f1f'],
    accent: '#a5f3fc',
    glow: '#22d3ee',
    metal: ['#fff7c2', '#ffd34d', '#b77900', '#fff1a8'],
    ink: '#3b2200',
    title: 'โล่ป้องกัน',
    tag: 'COMBO ➜ คนถัดไป',
  },
  SHUFFLE: {
    body: ['#4a044e', '#c026d3', '#1a0420'],
    accent: '#fbcfe8',
    glow: '#f472b6',
    metal: ['#ffe4f1', '#ff9bd2', '#b23c8a', '#fff0f8'],
    ink: '#4a044e',
    title: 'สลับที่นั่ง',
    tag: 'สุ่มลำดับผู้เล่น',
  },
};

function MirrorEmblem({ accent, uid }: { accent: string; uid: string }) {
  // a faceted diamond mirror; an arrow strikes it and bounces back
  return (
    <g>
      <polygon points="50,44 70,66 50,88 30,66" fill={`url(#sxm-${uid})`} stroke="#fff" strokeWidth="1.6" />
      <polygon points="50,49 65,66 50,83 35,66" fill={`url(#sxr-${uid})`} />
      <polygon points="41,58 47,52 56,74 50,80" fill="rgba(255,255,255,0.55)" />
      <path d="M14 52 L44 66" stroke={accent} strokeWidth="4.2" strokeLinecap="round" />
      <path d="M44 66 L16 82" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeDasharray="5 3" />
      <path d="M16 82 l3 -8 M16 82 l8 1" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="44" cy="66" r="3.2" fill="#fff" />
    </g>
  );
}

function ShieldEmblem({ accent, uid }: { accent: string; uid: string }) {
  return (
    <g strokeLinejoin="round">
      <circle cx="50" cy="66" r="24" fill="none" stroke={accent} strokeWidth="1.2" strokeDasharray="2 3" opacity="0.8">
        <animateTransform attributeName="transform" type="rotate" from="0 50 66" to="360 50 66" dur="9s" repeatCount="indefinite" />
      </circle>
      <path d="M50 44 L68 51 V65 C68 77 60 85 50 89 C40 85 32 77 32 65 V51 Z" fill={`url(#sxc-${uid})`} stroke={`url(#sxm-${uid})`} strokeWidth="3.2" />
      <path d="M50 50 L62 55 V65 C62 73 57 79 50 82 Z" fill="rgba(255,255,255,0.35)" />
      <path d="M50 56 l3 6.5 7 .6 -5.3 4.6 1.7 6.9 -6.4 -3.8 -6.4 3.8 1.7 -6.9 -5.3 -4.6 7 -.6 z" fill="#fff7c2" stroke="#b77900" strokeWidth="0.8" />
    </g>
  );
}

function ShuffleEmblem({ accent }: { accent: string }) {
  // four seats (player dots) around a ring, chased by arrows; a "?" in the middle
  const seats = [
    { a: -90, c: '#ff2d55' },
    { a: 0, c: '#ffc800' },
    { a: 90, c: '#14d97c' },
    { a: 180, c: '#2f7bff' },
  ];
  return (
    <g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 50 66" to="360 50 66" dur="6s" repeatCount="indefinite" />
        {seats.map(({ a, c }) => {
          const r = 17;
          const x = 50 + r * Math.cos((a * Math.PI) / 180);
          const y = 66 + r * Math.sin((a * Math.PI) / 180);
          const a2 = ((a + 62) * Math.PI) / 180;
          const a1 = ((a + 22) * Math.PI) / 180;
          return (
            <g key={a}>
              <path
                d={`M ${50 + r * Math.cos(a1)} ${66 + r * Math.sin(a1)} A ${r} ${r} 0 0 1 ${50 + r * Math.cos(a2)} ${66 + r * Math.sin(a2)}`}
                fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round"
              />
              <circle cx={x} cy={y} r="5.6" fill={c} stroke="#fff" strokeWidth="1.6" />
            </g>
          );
        })}
      </g>
      <text x="50" y="67" textAnchor="middle" dominantBaseline="central" fontSize="17" fontWeight={900} fill="#fff" stroke="#4a044e" strokeWidth="2.5" paintOrder="stroke">?</text>
    </g>
  );
}

function Sparkle({ x, y, s, delay }: { x: number; y: number; s: number; delay: string }) {
  return (
    <path d={`M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`} fill="#fff">
      <animate attributeName="opacity" values="0;1;0" dur="2.2s" begin={delay} repeatCount="indefinite" />
    </path>
  );
}

function SpecialFace({ kind, uid, compact }: { kind: SpecialKind; uid: string; compact: boolean }) {
  const t = SPECIAL_THEME[kind];
  const id = (n: string) => `${n}-${uid}`;
  return (
    <g>
      <defs>
        <linearGradient id={id('sb')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.body[1]} />
          <stop offset="0.55" stopColor={t.body[0]} />
          <stop offset="1" stopColor={t.body[2]} />
        </linearGradient>
        <linearGradient id={id('holo')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6ad5" stopOpacity="0" />
          <stop offset="0.3" stopColor="#ff6ad5" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#8ef6ff" stopOpacity="0.3" />
          <stop offset="0.6" stopColor="#fff38a" stopOpacity="0.25" />
          <stop offset="0.75" stopColor="#b388ff" stopOpacity="0" />
          <animateTransform attributeName="gradientTransform" type="translate" values="-1 -1; 1 1; -1 -1" dur="5s" repeatCount="indefinite" />
        </linearGradient>
        <linearGradient id={`sxm-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.metal[0]} />
          <stop offset="0.35" stopColor={t.metal[1]} />
          <stop offset="0.65" stopColor={t.metal[2]} />
          <stop offset="1" stopColor={t.metal[3]} />
        </linearGradient>
        <linearGradient id={`sxr-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5f3ff" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#3b0764" />
        </linearGradient>
        <linearGradient id={`sxc-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="0.5" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#0c4a6e" />
        </linearGradient>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={t.glow} stopOpacity="0.95" />
          <stop offset="0.55" stopColor={t.glow} stopOpacity="0.35" />
          <stop offset="1" stopColor={t.glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* body + holographic foil */}
      <rect width="100" height="150" fill={`url(#${id('sb')})`} />
      <rect width="100" height="150" fill={`url(#${id('holo')})`} />

      {/* rotating light rays */}
      <g opacity="0.22">
        <animateTransform attributeName="transform" type="rotate" from="0 50 66" to="360 50 66" dur="24s" repeatCount="indefinite" />
        {Array.from({ length: 12 }).map((_, i) => (
          <polygon key={i} points="50,66 46,-10 54,-10" fill={t.accent} transform={`rotate(${i * 30} 50 66)`} />
        ))}
      </g>

      {/* frames */}
      <rect x="3.5" y="3.5" width="93" height="143" rx="11" fill="none" stroke={`url(#sxm-${uid})`} strokeWidth="3.5" />
      <rect x="8.5" y="8.5" width="83" height="133" rx="8" fill="none" stroke={t.accent} strokeOpacity="0.55" strokeWidth="0.8" strokeDasharray="3 2" />

      {/* tag pill */}
      {!compact && (
        <g>
          <rect x="24" y="12.5" width="52" height="12" rx="6" fill="rgba(0,0,0,0.45)" stroke={t.accent} strokeOpacity="0.7" strokeWidth="0.7" />
          <text x="50" y="18.7" textAnchor="middle" dominantBaseline="central" fontSize="5.1" fontWeight={800} fill={t.accent} textLength={t.tag.length > 14 ? 46 : undefined} lengthAdjust="spacingAndGlyphs">{t.tag}</text>
        </g>
      )}

      {/* medallion */}
      <circle cx="50" cy="66" r="36" fill={`url(#${id('glow')})`}>
        <animate attributeName="r" values="31;37;31" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="66" r="27" fill="rgba(0,0,0,0.38)" stroke={`url(#sxm-${uid})`} strokeWidth="2.6" />
      {kind === 'REFLECT' && <MirrorEmblem accent={t.accent} uid={uid} />}
      {kind === 'SHIELD' && <ShieldEmblem accent={t.accent} uid={uid} />}
      {kind === 'SHUFFLE' && <ShuffleEmblem accent={t.accent} />}

      {/* sparkles */}
      <Sparkle x={22} y={44} s={3.2} delay="0s" />
      <Sparkle x={79} y={50} s={2.6} delay="0.7s" />
      <Sparkle x={74} y={92} s={3} delay="1.4s" />
      <Sparkle x={26} y={90} s={2.2} delay="1.9s" />

      {/* title ribbon */}
      <g>
        <path d="M6 104 H94 L89 111.5 L94 119 H6 L11 111.5 Z" fill="rgba(0,0,0,0.35)" transform="translate(0 1.6)" />
        <path d="M6 104 H94 L89 111.5 L94 119 H6 L11 111.5 Z" fill={`url(#sxm-${uid})`} stroke="rgba(255,255,255,0.8)" strokeWidth="0.7" />
        <text x="50" y="111.8" textAnchor="middle" dominantBaseline="central" fontSize={compact ? 10 : 11.5} fontWeight={900} fill={t.ink}>
          {t.title}
        </text>
      </g>

      {/* corner badges */}
      {[false, true].map((flip) => (
        <g key={String(flip)} transform={flip ? 'rotate(180 50 75)' : undefined}>
          <circle cx="14" cy="17" r="8.4" fill={t.body[2]} stroke={`url(#sxm-${uid})`} strokeWidth="1.6" />
          {kind === 'REFLECT' && <ReflectGlyph cx={14} cy={17} s={5.4} color="#fff" />}
          {kind === 'SHIELD' && <ShieldGlyph cx={14} cy={17} s={5.4} color="#fff" />}
          {kind === 'SHUFFLE' && <ShuffleGlyph cx={14} cy={17} s={5.4} color="#fff" />}
        </g>
      ))}
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
      ) : card.kind === 'SHIELD' ? (
        <ShieldGlyph cx={14} cy={17} s={8} color="#fff" />
      ) : card.kind === 'SHUFFLE' ? (
        <ShuffleGlyph cx={14} cy={17} s={8} color="#fff" />
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
  // Colorless special cards each get their own theme: [light, mid, deep, ink, oval-tint]
  const SPECIAL: Record<string, [string, string, string, string, string]> = {
    REFLECT: ['#f0e6ff', '#9f7bff', '#3a1d8f', '#3a1d8f', '#e9ddff'],
    SHIELD: ['#e0fbff', '#22c3e6', '#0b4f8a', '#0b4f8a', '#dff7ff'],
    SHUFFLE: ['#ffe9f6', '#ff5fc8', '#7a1fa2', '#7a1fa2', '#ffe1f4'],
  };
  const special = SPECIAL[card.kind] ?? null;
  const pal = card.color && !special ? PALETTE[card.color] : null;
  const ink = pal ? pal[3] : '#111';
  const txt = label(card);
  const isAction = card.kind !== 'NUMBER';

  // Card body fill
  const bodyStops: [string, string, string] = special
    ? [special[0], special[1], special[2]]
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
        card.kind === 'REFLECT' && 'shadow-[0_0_18px_-2px_rgba(167,139,250,0.85)]',
        card.kind === 'SHIELD' && 'shadow-[0_0_18px_-2px_rgba(34,211,238,0.85)]',
        card.kind === 'SHUFFLE' && 'shadow-[0_0_18px_-2px_rgba(244,114,182,0.85)]',
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
            <stop offset="1" stopColor={special ? special[4] : wild ? '#f4f4f5' : '#fff7ec'} />
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

        {special ? (
          <SpecialFace kind={card.kind as SpecialKind} uid={uid} compact={size === 'xs'} />
        ) : (
        <>
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

        {/* corners */}
        <Corner card={card} color={wild ? '#000' : special ? special[3] : ink} />
        <Corner card={card} color={wild ? '#000' : special ? special[3] : ink} flip />

        {/* gloss */}
        <rect width="100" height="70" fill={`url(#h-${uid})`} />
        </>
        )}
      </svg>

      {/* moving sheen on action / wild / reflect cards */}
      {isAction && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: special ? 'linear-gradient(115deg, transparent 30%, rgba(255,120,220,0.35) 42%, rgba(140,246,255,0.45) 50%, rgba(255,243,138,0.35) 58%, transparent 70%)' : 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.5) 50%, transparent 65%)' }}
          initial={{ x: '-130%' }}
          animate={{ x: '130%' }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
        />
      )}
    </motion.button>
  );
}
