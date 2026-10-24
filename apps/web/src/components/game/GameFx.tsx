'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { GameResult, GameState } from '@cma/shared';
import { playClip } from '@/lib/sounds';
import { allowShake, fxCount } from '@/lib/perf';
import dynamic from 'next/dynamic';
import { hashStr, LOSER_TEASES, LOSER_VARIANTS, type LoserInfo } from './loserData';

// The loser overlay is only needed at the end of a match — load its code on demand.
const LoserOverlay = dynamic(() => import('./LoserFx').then((r) => r.LoserOverlay), { ssr: false });

type ComboVariant = 'D2' | 'WD2' | 'WD4' | 'WD8';
const COMBO_STYLE: Record<ComboVariant, { label: string; ring: string; flash: string; grad: string; border: string; emojis: string[]; sound: string; sound2?: string }> = {
  D2: { label: '🔥 คอมโบไฟ', ring: 'border-orange-400/80', flash: 'bg-orange-500', grad: 'from-yellow-100 via-orange-400 to-red-600', border: 'border-orange-300', emojis: ['🔥', '🔥', '💥'], sound: 'vine-boom' },
  WD2: { label: '🌈 คอมโบสายรุ้ง', ring: 'border-fuchsia-300/80', flash: 'bg-fuchsia-500', grad: 'from-pink-200 via-fuchsia-400 to-indigo-500', border: 'border-fuchsia-300', emojis: ['🌈', '✨', '💫'], sound: 'faaah' },
  WD4: { label: '⚡ คอมโบสายฟ้า', ring: 'border-violet-300/90', flash: 'bg-violet-700', grad: 'from-white via-violet-300 to-violet-700', border: 'border-violet-300', emojis: ['⚡', '⚡', '🌩️'], sound: 'among-us-role-reveal-sound' },
  WD8: { label: '☢️ คอมโบนิวเคลียร์', ring: 'border-yellow-200/90', flash: 'bg-white', grad: 'from-white via-yellow-300 to-red-700', border: 'border-yellow-300', emojis: ['💣', '☢️', '💥'], sound: 'mlg-airhorn', sound2: 'fahhhhhhhhhhhhhh' },
};

type Fx =
  | { key: string; type: 'COMBO'; name: string; count: number }
  | { key: string; type: 'COMBO_UP'; from: string; to: string; count: number; added: number; variant: ComboVariant }
  | { key: string; type: 'REFLECT'; from: string; to: string; count: number }
  | { key: string; type: 'VANISH'; name: string; count: number }
  | { key: string; type: 'SHIELD'; from: string; to: string; count: number }
  | { key: string; type: 'SHUFFLE'; name: string; order: string[] };

/**
 * Event-driven overlays shared by the player screen and the big board:
 *  - COMBO hit (someone absorbs a +N combo): screen shake, impact burst, big "+N" + punchy sounds
 *  - REFLECT (สะท้อนกลับ): mirror flash + who bounced it to whom
 *  - VANISH: Reflect cards dissolving once they can never be used again
 *  - LOSER: when a match ends, the last-place player gets "<name> ดุ่ยดุ้ย"
 * Only events that arrive AFTER mount are played (history replay on reconnect is ignored).
 */
export function GameFx({ game, result, nameOf, avatarOf }: { game: GameState | null; result: GameResult | null; nameOf: (id: string | null | undefined) => string; avatarOf?: (id: string | null | undefined, nickname?: string) => string | null | undefined }) {
  const [fx, setFx] = useState<Fx | null>(null);
  const [loser, setLoser] = useState<LoserInfo | null>(null);
  const avatarRef = useRef(avatarOf);
  avatarRef.current = avatarOf;
  const lastSeq = useRef<number | null>(null);
  const lastGameId = useRef<string | null>(null);
  const lastResultId = useRef<string | null>(null);
  const loserTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef(nameOf);
  nameRef.current = nameOf;

  useEffect(() => {
    const hist = game?.history ?? [];
    const maxSeq = hist.length ? hist[hist.length - 1].seq : 0;
    if (!game) return;
    // Each new match restarts history seq at 1 — without this reset, every match after the first
    // played NO effects until its seq passed the previous match's last seq.
    if (lastGameId.current !== game.gameId) {
      const firstSight = lastGameId.current === null;
      lastGameId.current = game.gameId;
      // joined/reloaded mid-match → don't replay old history; a brand-new match → watch from 0
      lastSeq.current = firstSight && hist.length > 3 ? maxSeq : 0;
      if (firstSight && hist.length > 3) return;
    }
    if (lastSeq.current === null) lastSeq.current = 0;
    const fresh = hist.filter((h) => h.seq > (lastSeq.current ?? 0));
    lastSeq.current = Math.max(lastSeq.current, maxSeq);
    // newest interesting event wins
    for (let i = fresh.length - 1; i >= 0; i--) {
      const h = fresh[i];
      if (h.action === 'ABSORB') {
        const count = h.count ?? 0;
        setFx({ key: `a${h.seq}`, type: 'COMBO', name: nameRef.current(h.playerId), count });
        playClip('punch', 1);
        setTimeout(() => playClip(count >= 8 ? 'mlg-airhorn' : count >= 6 ? 'fahhhhhhhhhhhhhh' : 'vine-boom', 1), 180);
        return;
      }
      if (h.action === 'PLAY' && h.cards?.length !== 0 && game.pendingDraw) {
        const cards = h.cards ?? (h.card ? [h.card] : []);
        const added = cards.reduce((n, c) => n + (c.kind === 'DRAW_TWO' || c.kind === 'WILD_DRAW_TWO' ? 2 : c.kind === 'WILD_DRAW_FOUR' ? 4 : c.kind === 'WILD_DRAW_EIGHT' ? 8 : 0), 0);
        if (added > 0) {
          const total = game.pendingDraw.count;
          const kinds = cards.map((c) => c.kind);
          const variant: ComboVariant = kinds.includes('WILD_DRAW_EIGHT') ? 'WD8' : kinds.includes('WILD_DRAW_FOUR') ? 'WD4' : kinds.includes('WILD_DRAW_TWO') ? 'WD2' : 'D2';
          setFx({ key: `u${h.seq}`, type: 'COMBO_UP', from: nameRef.current(h.playerId), to: nameRef.current(game.pendingDraw.targetId), count: total, added, variant });
          const st = COMBO_STYLE[variant];
          playClip(st.sound, 1);
          if (st.sound2) setTimeout(() => playClip(st.sound2!, 1), 350);
          return;
        }
      }
      if (h.action === 'REFLECT') {
        setFx({ key: `r${h.seq}`, type: 'REFLECT', from: nameRef.current(h.playerId), to: nameRef.current(h.toPlayerId), count: h.count ?? 0 });
        playClip('wing', 1);
        setTimeout(() => playClip('anime-wow-sound-effect', 0.9), 250);
        return;
      }
      if (h.action === 'SHIELD') {
        setFx({ key: `s${h.seq}`, type: 'SHIELD', from: nameRef.current(h.playerId), to: nameRef.current(h.toPlayerId), count: h.count ?? 0 });
        playClip('bone-crack', 1);
        return;
      }
      if (h.action === 'SHUFFLE_SEATS') {
        setFx({ key: `f${h.seq}`, type: 'SHUFFLE', name: nameRef.current(h.playerId), order: (h.seatOrder ?? []).map((id) => nameRef.current(id)) });
        playClip('dun-dun-dun', 1);
        return;
      }
      if (h.action === 'VANISH') {
        setFx({ key: `v${h.seq}`, type: 'VANISH', name: nameRef.current(h.playerId), count: h.count ?? 1 });
        playClip('wuued-luuen', 1);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.history, game?.gameId]);

  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setFx(null), fx.type === 'COMBO' ? 2300 : fx.type === 'COMBO_UP' ? (fx.variant === 'WD8' ? 2200 : 1700) : fx.type === 'SHUFFLE' ? 3000 : 2000);
    return () => clearTimeout(t);
  }, [fx]);

  // Last-place player when a match ends → "<name> ดุ่ยดุ้ย"
  useEffect(() => {
    if (!result) return;
    if (lastResultId.current === result.gameId) return;
    const first = lastResultId.current === null && Date.now() - result.endedAt > 15000; // stale on (re)load
    lastResultId.current = result.gameId;
    if (first) return;
    if (result.ranking.length < 2) return;
    const last = [...result.ranking].sort((a, b) => a.rank - b.rank)[result.ranking.length - 1];
    // Same style/tease on every screen for this match, different from match to match.
    const h = hashStr(result.gameId);
    const variant = h % LOSER_VARIANTS.length;
    const tease = LOSER_TEASES[Math.floor(h / LOSER_VARIANTS.length) % LOSER_TEASES.length];
    setLoser({ key: result.gameId, name: last.nickname, avatar: avatarRef.current?.(last.playerId, last.nickname) ?? null, cardsLeft: last.cardsLeft, variant, tease });
    setTimeout(() => playClip(LOSER_VARIANTS[variant].sound, 1), 400);
    // Timer in a ref: a resync/reconnect re-sends the SAME result as a new object, which re-runs
    // this effect and returns early above — a cleanup-cancelled timer would leave the overlay stuck.
    if (loserTimer.current) clearTimeout(loserTimer.current);
    loserTimer.current = setTimeout(() => setLoser(null), 6000);
  }, [result]);
  useEffect(() => () => { if (loserTimer.current) clearTimeout(loserTimer.current); }, []);

  return (
    <>
      <AnimatePresence>
        {fx?.type === 'COMBO_UP' && (() => {
          const st = COMBO_STYLE[fx.variant];
          const v = fx.variant;
          return (
            <m.div
              key={fx.key}
              className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center overflow-hidden"
              initial={{ opacity: 0 }}
              animate={allowShake() ? { opacity: 1, x: v === 'WD8' ? [0, -22, 20, -16, 12, -8, 4, 0] : [0, -8, 7, -5, 3, 0], y: v === 'WD8' ? [0, 12, -14, 8, -4, 0] : 0 } : { opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: v === 'WD8' ? 0.8 : 0.4 }}
            >
              {/* flash */}
              {v === 'WD4' ? (
                <m.div className={`absolute inset-0 ${st.flash}`} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.75, 0.1, 0.65, 0, 0.4, 0] }} transition={{ duration: 0.9 }} />
              ) : (
                <m.div className={`absolute inset-0 ${st.flash}`} initial={{ opacity: v === 'WD8' ? 0.95 : 0.35 }} animate={{ opacity: 0 }} transition={{ duration: v === 'WD8' ? 0.9 : 0.5 }} />
              )}

              {/* variant background */}
              {v === 'D2' && (
                <m.div className={`absolute w-[60vmin] h-[60vmin] rounded-full border-[12px] ${st.ring}`} initial={{ scale: 0.1, opacity: 1 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }} />
              )}
              {v === 'WD2' && (
                <m.div
                  className="absolute w-[90vmin] h-[90vmin] rounded-full opacity-60"
                  style={{ background: 'conic-gradient(#ff2d55, #ffc800, #14d97c, #2f7bff, #b388ff, #ff2d55)', maskImage: 'radial-gradient(circle, transparent 30%, black 31%, black 45%, transparent 46%)', WebkitMaskImage: 'radial-gradient(circle, transparent 30%, black 31%, black 45%, transparent 46%)' }}
                  initial={{ scale: 0.2, rotate: 0 }}
                  animate={{ scale: 1.4, rotate: 360, opacity: [0.8, 0.8, 0] }}
                  transition={{ duration: 1.3, ease: 'easeOut' }}
                />
              )}
              {v === 'WD4' &&
                [12, 38, 64, 86].map((left, i) => (
                  <m.svg
                    key={i}
                    viewBox="0 0 40 100"
                    className="absolute top-0 w-10 h-[55vh]"
                    style={{ left: `${left}%` }}
                    initial={{ opacity: 0, y: -40 }}
                    animate={{ opacity: [0, 1, 0, 1, 0], y: 0 }}
                    transition={{ duration: 0.7, delay: i * 0.08 }}
                  >
                    <polygon points="22,0 6,55 20,55 12,100 36,38 22,38 30,0" fill="#fff" stroke="#a78bfa" strokeWidth="2" />
                  </m.svg>
                ))}
              {v === 'WD8' &&
                [0, 0.12, 0.24].map((d, i) => (
                  <m.div
                    key={i}
                    className={`absolute w-[50vmin] h-[50vmin] rounded-full border-[16px] ${st.ring}`}
                    initial={{ scale: 0.1, opacity: 1 }}
                    animate={{ scale: 2.6, opacity: 0 }}
                    transition={{ duration: 1.1, delay: d, ease: 'easeOut' }}
                  />
                ))}

              {/* flying emojis */}
              {Array.from({ length: fxCount(v === 'WD8' ? 18 : 10) }).map((_, i, arr) => (
                <m.span
                  key={i}
                  className="absolute text-3xl sm:text-4xl"
                  initial={{ x: 0, y: v === 'D2' ? 120 : 0, scale: 0.4, opacity: 1 }}
                  animate={
                    v === 'D2'
                      ? { x: (i - arr.length / 2) * 38, y: -260 - (i % 3) * 40, scale: 1.2, opacity: 0 }
                      : { x: Math.cos((i / arr.length) * Math.PI * 2) * (v === 'WD8' ? 420 : 280), y: Math.sin((i / arr.length) * Math.PI * 2) * (v === 'WD8' ? 320 : 220), scale: 1.3, opacity: 0, rotate: 180 }
                  }
                  transition={{ duration: v === 'WD8' ? 1.3 : 1, ease: 'easeOut' }}
                >
                  {st.emojis[i % st.emojis.length]}
                </m.span>
              ))}

              {/* number + caption */}
              <m.div
                className="relative text-center"
                initial={{ scale: v === 'WD8' ? 4 : 2.4, rotate: v === 'WD4' ? -15 : 10, opacity: 0 }}
                animate={{ scale: [v === 'WD8' ? 4 : 2.4, 0.92, 1.06, 1], rotate: [v === 'WD4' ? -15 : 10, -3, 1, 0], opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <div className="text-sm sm:text-base font-black tracking-wide text-white drop-shadow mb-1">{st.label}</div>
                <m.div
                  className={`font-black leading-none ${v === 'WD8' ? 'text-[24vw] sm:text-[11rem]' : 'text-[18vw] sm:text-[8rem]'} bg-gradient-to-b ${st.grad} bg-clip-text text-transparent`}
                  style={{ WebkitTextStroke: '3px #2a0a00', filter: 'drop-shadow(0 6px 0 rgba(0,0,0,0.5))' }}
                  animate={v === 'WD2' ? { rotate: [0, -4, 4, -2, 0] } : undefined}
                  transition={v === 'WD2' ? { duration: 0.8 } : undefined}
                >
                  +{fx.count}
                </m.div>
                <div className={`mt-1 inline-block px-4 py-1.5 rounded-2xl bg-black/80 border-2 ${st.border} text-lg sm:text-2xl font-black text-white`}>
                  {fx.from} ส่งคอมโบ{fx.added !== fx.count ? ` (+${fx.added})` : ''} ➜ {fx.to}
                </div>
              </m.div>
            </m.div>
          );
        })()}

        {fx?.type === 'COMBO' && (
          <m.div
            key={fx.key}
            className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={allowShake() ? { opacity: 1, x: [0, -18, 16, -12, 10, -6, 4, 0], y: [0, 10, -12, 8, -6, 4, 0] } : { opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <m.div className="absolute inset-0 bg-red-600" initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }} />
            {/* impact rays */}
            <m.div
              className="absolute w-[160vmax] h-[160vmax]"
              style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,214,0,0.35) 0deg 8deg, transparent 8deg 20deg)' }}
              initial={{ scale: 0.2, rotate: 0, opacity: 1 }}
              animate={{ scale: 1, rotate: 40, opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
            {Array.from({ length: fxCount(14) }).map((_, i, arr) => (
              <m.span
                key={i}
                className="absolute text-3xl"
                initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
                animate={{ x: Math.cos((i / arr.length) * Math.PI * 2) * 320, y: Math.sin((i / arr.length) * Math.PI * 2) * 240, scale: 1.3, opacity: 0, rotate: 200 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              >
                {['💥', '🃏', '💢', '⭐'][i % 4]}
              </m.span>
            ))}
            <m.div
              className="relative text-center"
              initial={{ scale: 3.2, rotate: -14, opacity: 0 }}
              animate={{ scale: [3.2, 0.9, 1.08, 1], rotate: [-14, 4, -2, 0], opacity: 1 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
            >
              <div
                className="font-black leading-none text-[22vw] sm:text-[11rem] bg-gradient-to-b from-yellow-200 via-amber-400 to-red-600 bg-clip-text text-transparent"
                style={{ WebkitTextStroke: '3px #3b0a00', filter: 'drop-shadow(0 8px 0 rgba(0,0,0,0.55))' }}
              >
                +{fx.count}
              </div>
              <m.div
                className="mt-2 inline-block px-5 py-2 rounded-2xl bg-black/80 border-2 border-yellow-300 text-xl sm:text-3xl font-black text-white"
                animate={{ rotate: [-2, 2, -2] }}
                transition={{ duration: 0.4, repeat: 4 }}
              >
                💥 {fx.name} โดนคอมโบ! จั่ว {fx.count} ใบ 🤣
              </m.div>
            </m.div>
          </m.div>
        )}

        {fx?.type === 'REFLECT' && (
          <m.div
            key={fx.key}
            className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <m.div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(200,170,255,0.75) 50%, transparent 70%)' }}
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 0.7 }}
            />
            <m.div
              initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="px-8 py-6 rounded-3xl bg-gradient-to-br from-violet-200 via-fuchsia-500 to-indigo-800 border-2 border-white/60 shadow-[0_0_60px_rgba(168,85,247,0.8)] text-center"
            >
              <m.div className="text-6xl" animate={{ scaleX: [1, -1, 1] }} transition={{ duration: 0.5, repeat: 2 }}>🪞</m.div>
              <div className="text-3xl font-black text-white drop-shadow">สะท้อนกลับ! +{fx.count}</div>
              <div className="text-lg font-bold text-white/90 mt-1">
                {fx.from} ➜ {fx.to}
              </div>
            </m.div>
          </m.div>
        )}

        {fx?.type === 'SHIELD' && (
          <m.div key={fx.key} className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <m.div
              className="absolute w-[70vmin] h-[70vmin] rounded-full border-[10px] border-cyan-300/80"
              initial={{ scale: 0.2, opacity: 1 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            <m.div
              initial={{ scale: 0.3, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="px-8 py-6 rounded-3xl bg-gradient-to-br from-cyan-200 via-sky-500 to-blue-900 border-2 border-white/60 shadow-[0_0_60px_rgba(34,195,230,0.8)] text-center"
            >
              <m.div className="text-6xl" animate={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 0.4, repeat: 2 }}>🛡️</m.div>
              <div className="text-3xl font-black text-white drop-shadow">โล่ป้องกัน! +{fx.count}</div>
              <div className="text-lg font-bold text-white/90 mt-1">{fx.from} ส่งต่อ ➜ {fx.to}</div>
            </m.div>
          </m.div>
        )}

        {fx?.type === 'SHUFFLE' && (
          <m.div key={fx.key} className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <m.div
              initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 13 }}
              className="max-w-[92vw] px-6 py-5 rounded-3xl bg-gradient-to-br from-pink-300 via-fuchsia-500 to-purple-900 border-2 border-white/60 shadow-[0_0_60px_rgba(236,72,153,0.8)] text-center"
            >
              <m.div className="text-6xl" animate={{ rotate: [0, 360] }} transition={{ duration: 0.8, repeat: 1 }}>🔀</m.div>
              <div className="text-3xl font-black text-white drop-shadow">สลับที่นั่ง!</div>
              <div className="text-sm text-white/80 mb-2">{fx.name} สับลำดับผู้เล่นใหม่ — แล้วลงไพ่ต่อ</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {fx.order.map((n, i) => (
                  <m.span
                    key={i}
                    initial={{ y: -30, opacity: 0, rotate: (i % 2 ? 1 : -1) * 30 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="px-2.5 py-1 rounded-full bg-black/40 border border-white/30 text-sm font-bold text-white"
                  >
                    {i + 1}. {n}
                  </m.span>
                ))}
              </div>
            </m.div>
          </m.div>
        )}

        {fx?.type === 'VANISH' && (
          <m.div
            key={fx.key}
            className="fixed inset-x-0 top-24 z-[80] pointer-events-none flex justify-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="px-5 py-3 rounded-2xl bg-violet-950/90 border border-violet-400/50 text-violet-100 font-bold">
              ✨ ไพ่สะท้อน/โล่ของ {fx.name} หายไป ({fx.count} ใบ) — ไม่มีคอมโบเหลือแล้ว
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loser && <LoserOverlay key={loser.key} loser={loser} />}
      </AnimatePresence>
    </>
  );
}
