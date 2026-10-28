'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { GameState } from '@cma/shared';
import { EV, TURN_TIME_MS } from '@cma/shared';
import { socket } from '@/lib/socket';

type G = GameState & { receivedAt?: number };

/** Countdown for the current turn (server auto-plays a random move at 0). The bar shrinks with a
 *  single CSS transition (compositor-only); the number ticks 4×/s. */
export function TurnTimer({ game, mine, compact }: { game: G; mine: boolean; compact?: boolean }) {
  const total = TURN_TIME_MS;
  const left0 = game.turnEndsIn ?? null;
  const deadline = left0 == null ? null : (game.receivedAt ?? Date.now()) + left0;
  const [now, setNow] = useState(() => Date.now());
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    const r = requestAnimationFrame(() => setArmed(true));
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => {
      cancelAnimationFrame(r);
      clearInterval(t);
    };
  }, [deadline]);
  if (deadline == null || game.gameStatus === 'FINISHED') return null;
  const leftMs = Math.max(0, deadline - now);
  const secs = Math.ceil(leftMs / 1000);
  const startFrac = Math.max(0, Math.min(1, (left0 ?? 0) / total));
  const urgent = secs <= 5;
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'px-1'}`}>
      <span className={`shrink-0 tabular-nums font-black ${compact ? 'text-sm' : 'text-base'} ${urgent ? 'text-red-400 fx-pulse' : mine ? 'text-amber-300' : 'text-zinc-400'}`}>
        ⏱ {secs}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          key={deadline}
          className={`absolute inset-0 origin-left rounded-full ${urgent ? 'bg-red-500' : mine ? 'bg-amber-400' : 'bg-emerald-500/70'}`}
          style={{
            transform: `scaleX(${armed ? 0 : startFrac})`,
            transition: armed ? `transform ${Math.max(0, (left0 ?? 0)) }ms linear` : 'none',
          }}
        />
      </div>
      {mine && urgent && !compact && <span className="shrink-0 text-xs font-bold text-red-300">รีบลง! ไม่งั้นสุ่มให้</span>}
    </div>
  );
}

/** "Time's up — played for X" toast when the server auto-plays. */
export function AutoPlayNotice() {
  const [msg, setMsg] = useState<{ k: number; text: string } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = (e: { nickname: string; action: string }) => {
      const what = e.action === 'DIRECTION' ? 'สุ่มทิศให้' : e.action === 'PLAY' ? 'สุ่มลงไพ่ให้' : 'จั่วให้';
      setMsg({ k: Date.now(), text: `⏱ ${e.nickname || 'ผู้เล่น'} หมดเวลา — ${what}` });
      if (t) clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2500);
    };
    socket.on(EV.GAME_AUTO_PLAYED, on);
    return () => {
      socket.off(EV.GAME_AUTO_PLAYED, on);
      if (t) clearTimeout(t);
    };
  }, []);
  return (
    <AnimatePresence>
      {msg && (
        <m.div
          key={msg.k}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-[65] px-4 py-2 rounded-full bg-zinc-900/95 border border-amber-400/40 text-amber-200 text-sm font-bold shadow-xl max-w-[92vw] truncate"
        >
          {msg.text}
        </m.div>
      )}
    </AnimatePresence>
  );
}
