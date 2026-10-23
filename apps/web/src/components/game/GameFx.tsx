'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameResult, GameState } from '@cma/shared';
import { playClip } from '@/lib/sounds';

type Fx =
  | { key: string; type: 'COMBO'; name: string; count: number }
  | { key: string; type: 'COMBO_UP'; from: string; to: string; count: number; added: number }
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
  const [loser, setLoser] = useState<{ key: string; name: string; avatar?: string | null } | null>(null);
  const avatarRef = useRef(avatarOf);
  avatarRef.current = avatarOf;
  const lastSeq = useRef<number | null>(null);
  const lastGameId = useRef<string | null>(null);
  const lastResultId = useRef<string | null>(null);
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
          setFx({ key: `u${h.seq}`, type: 'COMBO_UP', from: nameRef.current(h.playerId), to: nameRef.current(game.pendingDraw.targetId), count: total, added });
          playClip(total >= 8 ? 'fahhhhhhhhhhhhhh' : 'vine-boom', 1);
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
    const t = setTimeout(() => setFx(null), fx.type === 'COMBO' ? 2300 : fx.type === 'COMBO_UP' ? 1600 : fx.type === 'SHUFFLE' ? 3000 : 2000);
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
    setLoser({ key: result.gameId, name: last.nickname, avatar: avatarRef.current?.(last.playerId, last.nickname) ?? null });
    setTimeout(() => playClip('spongebob-fail', 1), 400);
    const t = setTimeout(() => setLoser(null), 5200);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <>
      <AnimatePresence>
        {fx?.type === 'COMBO_UP' && (
          <motion.div
            key={fx.key}
            className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: [0, -8, 7, -5, 3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div className="absolute inset-0 bg-orange-500" initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} />
            <motion.div
              className="absolute w-[60vmin] h-[60vmin] rounded-full border-[12px] border-orange-400/80"
              initial={{ scale: 0.1, opacity: 1 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            <motion.div
              className="relative text-center"
              initial={{ scale: 2.4, rotate: 10, opacity: 0 }}
              animate={{ scale: [2.4, 0.95, 1.05, 1], rotate: [10, -3, 1, 0], opacity: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div
                className="font-black leading-none text-[18vw] sm:text-[8rem] bg-gradient-to-b from-yellow-100 via-orange-400 to-red-600 bg-clip-text text-transparent"
                style={{ WebkitTextStroke: '3px #3b0a00', filter: 'drop-shadow(0 6px 0 rgba(0,0,0,0.5))' }}
              >
                +{fx.count}
              </div>
              <div className="mt-1 inline-block px-4 py-1.5 rounded-2xl bg-black/80 border-2 border-orange-300 text-lg sm:text-2xl font-black text-white">
                🔥 {fx.from} ส่งคอมโบ{fx.added !== fx.count ? ` (+${fx.added})` : ''} ➜ {fx.to}
              </div>
            </motion.div>
          </motion.div>
        )}

        {fx?.type === 'COMBO' && (
          <motion.div
            key={fx.key}
            className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: [0, -18, 16, -12, 10, -6, 4, 0], y: [0, 10, -12, 8, -6, 4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div className="absolute inset-0 bg-red-600" initial={{ opacity: 0.6 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }} />
            {/* impact rays */}
            <motion.div
              className="absolute w-[160vmax] h-[160vmax]"
              style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,214,0,0.35) 0deg 8deg, transparent 8deg 20deg)' }}
              initial={{ scale: 0.2, rotate: 0, opacity: 1 }}
              animate={{ scale: 1, rotate: 40, opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
            {Array.from({ length: 14 }).map((_, i) => (
              <motion.span
                key={i}
                className="absolute text-3xl"
                initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
                animate={{ x: Math.cos((i / 14) * Math.PI * 2) * 320, y: Math.sin((i / 14) * Math.PI * 2) * 240, scale: 1.3, opacity: 0, rotate: 200 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              >
                {['💥', '🃏', '💢', '⭐'][i % 4]}
              </motion.span>
            ))}
            <motion.div
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
              <motion.div
                className="mt-2 inline-block px-5 py-2 rounded-2xl bg-black/80 border-2 border-yellow-300 text-xl sm:text-3xl font-black text-white"
                animate={{ rotate: [-2, 2, -2] }}
                transition={{ duration: 0.4, repeat: 4 }}
              >
                💥 {fx.name} โดนคอมโบ! จั่ว {fx.count} ใบ 🤣
              </motion.div>
            </motion.div>
          </motion.div>
        )}

        {fx?.type === 'REFLECT' && (
          <motion.div
            key={fx.key}
            className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(200,170,255,0.75) 50%, transparent 70%)' }}
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 0.7 }}
            />
            <motion.div
              initial={{ scale: 0.3, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotateY: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="px-8 py-6 rounded-3xl bg-gradient-to-br from-violet-200 via-fuchsia-500 to-indigo-800 border-2 border-white/60 shadow-[0_0_60px_rgba(168,85,247,0.8)] text-center"
            >
              <motion.div className="text-6xl" animate={{ scaleX: [1, -1, 1] }} transition={{ duration: 0.5, repeat: 2 }}>🪞</motion.div>
              <div className="text-3xl font-black text-white drop-shadow">สะท้อนกลับ! +{fx.count}</div>
              <div className="text-lg font-bold text-white/90 mt-1">
                {fx.from} ➜ {fx.to}
              </div>
            </motion.div>
          </motion.div>
        )}

        {fx?.type === 'SHIELD' && (
          <motion.div key={fx.key} className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="absolute w-[70vmin] h-[70vmin] rounded-full border-[10px] border-cyan-300/80"
              initial={{ scale: 0.2, opacity: 1 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
            <motion.div
              initial={{ scale: 0.3, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="px-8 py-6 rounded-3xl bg-gradient-to-br from-cyan-200 via-sky-500 to-blue-900 border-2 border-white/60 shadow-[0_0_60px_rgba(34,195,230,0.8)] text-center"
            >
              <motion.div className="text-6xl" animate={{ rotate: [0, -12, 12, 0] }} transition={{ duration: 0.4, repeat: 2 }}>🛡️</motion.div>
              <div className="text-3xl font-black text-white drop-shadow">โล่ป้องกัน! +{fx.count}</div>
              <div className="text-lg font-bold text-white/90 mt-1">{fx.from} ส่งต่อ ➜ {fx.to}</div>
            </motion.div>
          </motion.div>
        )}

        {fx?.type === 'SHUFFLE' && (
          <motion.div key={fx.key} className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 13 }}
              className="max-w-[92vw] px-6 py-5 rounded-3xl bg-gradient-to-br from-pink-300 via-fuchsia-500 to-purple-900 border-2 border-white/60 shadow-[0_0_60px_rgba(236,72,153,0.8)] text-center"
            >
              <motion.div className="text-6xl" animate={{ rotate: [0, 360] }} transition={{ duration: 0.8, repeat: 1 }}>🔀</motion.div>
              <div className="text-3xl font-black text-white drop-shadow">สลับที่นั่ง!</div>
              <div className="text-sm text-white/80 mb-2">{fx.name} สับลำดับผู้เล่นใหม่ — แล้วลงไพ่ต่อ</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {fx.order.map((n, i) => (
                  <motion.span
                    key={i}
                    initial={{ y: -30, opacity: 0, rotate: (i % 2 ? 1 : -1) * 30 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="px-2.5 py-1 rounded-full bg-black/40 border border-white/30 text-sm font-bold text-white"
                  >
                    {i + 1}. {n}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {fx?.type === 'VANISH' && (
          <motion.div
            key={fx.key}
            className="fixed inset-x-0 top-24 z-[80] pointer-events-none flex justify-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, filter: 'blur(8px)' }}
          >
            <div className="px-5 py-3 rounded-2xl bg-violet-950/90 border border-violet-400/50 text-violet-100 font-bold">
              ✨ ไพ่สะท้อน/โล่ของ {fx.name} หายไป ({fx.count} ใบ) — ไม่มีคอมโบเหลือแล้ว
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loser && (
          <motion.div
            key={loser.key}
            className="fixed inset-0 z-[85] pointer-events-none flex items-center justify-center bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: -400, rotate: -30, scale: 0.6 }}
              animate={{ y: 0, rotate: [0, -8, 8, -5, 5, 0], scale: 1 }}
              transition={{ y: { type: 'spring', stiffness: 160, damping: 10 }, rotate: { delay: 0.5, duration: 1.2, repeat: 2 } }}
              className="text-center px-6"
            >
              <motion.div className="relative mx-auto w-36 h-36 sm:w-44 sm:h-44" animate={{ y: [0, -12, 0], rotate: [0, -6, 6, 0] }} transition={{ duration: 0.8, repeat: Infinity }}>
                <motion.div
                  className="absolute -inset-3 rounded-full"
                  style={{ background: 'conic-gradient(#f0abfc, #fde047, #a3e635, #f472b6, #f0abfc)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                />
                {loser.avatar ? (
                  <img src={loser.avatar} alt={loser.name} className="relative w-full h-full rounded-full object-cover border-4 border-white shadow-[0_10px_40px_rgba(0,0,0,0.6)]" />
                ) : (
                  <div className="relative w-full h-full rounded-full border-4 border-white bg-gradient-to-br from-fuchsia-500 to-purple-800 flex items-center justify-center text-6xl sm:text-7xl font-black text-white shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
                    {loser.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <motion.span className="absolute -bottom-2 -right-2 text-5xl" animate={{ scale: [1, 1.3, 1], rotate: [0, 20, -20, 0] }} transition={{ duration: 0.7, repeat: Infinity }}>
                  🤪
                </motion.span>
                <span className="absolute -top-3 -left-3 text-4xl">💦</span>
              </motion.div>
              <div className="mt-2 font-black leading-tight text-5xl sm:text-7xl text-white" style={{ WebkitTextStroke: '2px #4a044e', textShadow: '0 6px 0 #a21caf, 0 12px 30px rgba(0,0,0,0.6)' }}>
                {loser.name}
              </div>
              <motion.div
                className="mt-3 inline-block font-black text-6xl sm:text-8xl bg-gradient-to-r from-pink-300 via-yellow-200 to-lime-300 bg-clip-text text-transparent"
                style={{ WebkitTextStroke: '2px #3f0d12' }}
                animate={{ scale: [1, 1.18, 0.92, 1.1, 1], skewX: [0, -10, 10, -6, 0] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              >
                ดุ่ยดุ้ย
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
