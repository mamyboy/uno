'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from 'motion/react';
import { BellOff, Bell, X } from 'lucide-react';
import { socket } from '@/lib/socket';
import { playClip } from '@/lib/sounds';
import { EV, MASCOTS, TAUNTS, TAUNT_COOLDOWN_MS, type TauntDef, type TauntMotion } from '@cma/shared';

const MASCOT_KEY = 'cma:mascot';
const MUTE_KEY = 'cma:taunt-mute';

function readMascot(): string {
  try {
    const m = localStorage.getItem(MASCOT_KEY);
    if (m && (MASCOTS as readonly string[]).includes(m)) return m;
  } catch { /* ignore */ }
  return MASCOTS[Math.floor(Math.random() * MASCOTS.length)];
}
const isMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
};

/** Mascot body motion for each taunt style. */
const MOTION: Record<TauntMotion, { animate: TargetAndTransition; transition: Transition }> = {
  laugh: { animate: { rotate: [0, -14, 14, -14, 14, 0], y: [0, -6, 0, -6, 0] }, transition: { duration: 0.6, repeat: 3 } },
  tongue: { animate: { scaleX: [1, 1.25, 0.85, 1.2, 1], rotate: [0, 8, -8, 0] }, transition: { duration: 0.5, repeat: 3 } },
  cry: { animate: { y: [0, 3, 0], rotate: [0, -4, 4, 0] }, transition: { duration: 0.9, repeat: 2 } },
  smug: { animate: { rotate: [0, 12, 12, 0], x: [0, 4, 4, 0] }, transition: { duration: 1.2, repeat: 1 } },
  sleep: { animate: { rotate: [0, 18, 18, 0], scale: [1, 0.95, 1.02, 1] }, transition: { duration: 1.6, repeat: 1 } },
  shock: { animate: { scale: [0.6, 1.5, 1.2, 1.3, 1.2], x: [0, -6, 6, -4, 0] }, transition: { duration: 0.6 } },
  point: { animate: { x: [0, 14, 0, 14, 0], scale: [1, 1.2, 1, 1.2, 1] }, transition: { duration: 0.5, repeat: 2 } },
  bye: { animate: { rotate: [0, -20, 20, -20, 20, 0], y: [0, 0, 0, 0, -10, -30], opacity: [1, 1, 1, 1, 1, 0.3] }, transition: { duration: 2.2 } },
  dance: { animate: { y: [0, -18, 0, -18, 0], rotate: [-15, 15, -15, 15, 0], scaleX: [1, -1, 1, -1, 1] }, transition: { duration: 0.9, repeat: 2 } },
  fart: { animate: { scaleY: [1, 0.8, 1.15, 1], y: [0, 4, -6, 0] }, transition: { duration: 0.6, repeat: 2 } },
};

/** Little extra particles per style. */
function Particles({ motion: m }: { motion: TauntMotion }) {
  const set: Partial<Record<TauntMotion, string[]>> = { laugh: ['🤣', '😂'], cry: ['💧', '💧'], sleep: ['💤', 'z'], shock: ['❗', '❕'], fart: ['💨', '💨'], dance: ['🎵', '🎶'], point: ['🫵'], tongue: ['💦'] };
  const list = set[m];
  if (!list) return null;
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 text-lg"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
          animate={
            m === 'cry'
              ? { opacity: [0, 1, 0], x: (i % 2 ? 1 : -1) * (10 + i * 4), y: 40, scale: 1 }
              : m === 'sleep' || m === 'fart' || m === 'dance'
                ? { opacity: [0, 1, 0], x: (i - 2) * 14, y: -50 - i * 6, scale: 1.2 }
                : { opacity: [0, 1, 0], x: Math.cos(i * 1.25) * 48, y: Math.sin(i * 1.25) * 40 - 10, scale: 1.2 }
          }
          transition={{ duration: 1.2, delay: i * 0.15, repeat: 1 }}
        >
          {list[i % list.length]}
        </motion.span>
      ))}
    </>
  );
}

type Shown = { key: string; playerId: string; nickname: string; mascot: string; taunt: TauntDef; x: number; y: number; anchored: boolean };

/** Shows every taunt in the room above the sender's seat (or as a top popup when no seat strip). */
export function TauntLayer({ big = false }: { big?: boolean }) {
  const [items, setItems] = useState<Shown[]>([]);
  useEffect(() => {
    function onTaunt(ev: { playerId: string; nickname: string; mascot: string; tauntId: string; at: number }) {
      const taunt = TAUNTS.find((t) => t.id === ev.tauntId);
      if (!taunt) return;
      if (!isMuted()) playClip(taunt.sound, 1);
      const el = document.querySelector<HTMLElement>(`[data-seat="${CSS.escape(ev.playerId)}"]`);
      const r = el?.getBoundingClientRect();
      const visible = !!r && r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      const x = visible ? Math.min(Math.max(r!.left + r!.width / 2, 110), window.innerWidth - 110) : window.innerWidth / 2;
      const y = visible ? Math.max(r!.top, 150) : 150;
      const key = `${ev.playerId}-${ev.at}`;
      setItems((list) => [...list.filter((s) => s.playerId !== ev.playerId), { key, playerId: ev.playerId, nickname: ev.nickname, mascot: ev.mascot, taunt, x, y, anchored: visible }]);
      setTimeout(() => setItems((list) => list.filter((s) => s.key !== key)), 3200);
    }
    socket.on(EV.ROOM_TAUNT, onTaunt);
    return () => {
      socket.off(EV.ROOM_TAUNT, onTaunt);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[75] pointer-events-none">
      <AnimatePresence>
        {items.map((s) => {
          const mv = MOTION[s.taunt.motion];
          return (
            <motion.div
              key={s.key}
              className="absolute"
              style={{ left: s.x, top: s.y }}
              initial={{ opacity: 0, scale: 0.3, x: '-50%', y: '-60%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-100%' }}
              exit={{ opacity: 0, scale: 0.6, x: '-50%', y: '-120%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            >
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className={`relative mb-1 max-w-[220px] rounded-2xl bg-white text-black font-black shadow-xl text-center ${big ? 'px-4 py-2 text-xl' : 'px-3 py-1.5 text-sm'}`}
                >
                  <span className="block text-[10px] font-bold text-zinc-500 leading-none mb-0.5">{s.nickname}</span>
                  {s.taunt.text}
                  <span className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 rotate-45 bg-white" />
                </motion.div>
                <div className={`relative ${big ? 'text-7xl' : 'text-5xl'}`}>
                  <Particles motion={s.taunt.motion} />
                  <motion.span className="inline-block drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]" animate={mv.animate} transition={mv.transition}>
                    {s.mascot}
                  </motion.span>
                  <motion.span
                    className={`absolute -right-4 -top-2 ${big ? 'text-4xl' : 'text-3xl'}`}
                    initial={{ scale: 0, rotate: -40 }}
                    animate={{ scale: [0, 1.4, 1], rotate: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                  >
                    {s.taunt.face}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Floating 😜 button: pick your mascot and fire a taunt the whole room sees and hears. */
export function TauntButton() {
  const [open, setOpen] = useState(false);
  const [mascot, setMascot] = useState<string>(MASCOTS[0]);
  const [muted, setMuted] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, force] = useState(0);
  const [err, setErr] = useState('');
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const m = readMascot();
    setMascot(m);
    try { localStorage.setItem(MASCOT_KEY, m); } catch { /* ignore */ }
    setMuted(isMuted());
  }, []);

  useEffect(() => {
    if (coolUntil <= Date.now()) return;
    tick.current = setInterval(() => {
      force((n) => n + 1);
      if (Date.now() >= coolUntil && tick.current) clearInterval(tick.current);
    }, 200);
    return () => tick.current && clearInterval(tick.current);
  }, [coolUntil]);

  const left = Math.max(0, coolUntil - Date.now());
  const pick = (m: string) => {
    setMascot(m);
    try { localStorage.setItem(MASCOT_KEY, m); } catch { /* ignore */ }
  };
  const toggleMute = () =>
    setMuted((v) => {
      try { localStorage.setItem(MUTE_KEY, v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  const fire = (t: TauntDef) => {
    if (left > 0) return;
    setCoolUntil(Date.now() + TAUNT_COOLDOWN_MS);
    setErr('');
    socket.emit(EV.ROOM_TAUNT, { tauntId: t.id, mascot }, (ack: { ok: boolean; error?: string }) => {
      if (!ack?.ok) setErr(ack?.error === 'TAUNT_COOLDOWN' ? 'ใจเย็นๆ รอแป๊บนึง' : 'ส่งไม่ได้ ลองใหม่');
    });
    setOpen(false);
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-[5.25rem] z-[60] w-14 h-14 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 border border-amber-200/50 flex items-center justify-center text-2xl shadow-[0_3px_0_0_rgba(120,53,15,0.6),0_8px_20px_-4px_rgba(245,158,11,0.5)]"
        title="ล้อเลียนทั้งห้อง"
      >
        {open ? <X className="w-6 h-6 text-white" /> : <span>{mascot}</span>}
        {left > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/85 text-[10px] font-bold text-white flex items-center justify-center">{Math.ceil(left / 1000)}</span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-5 z-[61] w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs text-zinc-400">ล้อเลียนทั้งห้อง 😜 ทุกคนเห็นและได้ยิน</p>
              <button onClick={toggleMute} className="text-zinc-400 hover:text-white" title={muted ? 'เปิดเสียงล้อเลียน' : 'ปิดเสียงล้อเลียนเครื่องนี้'}>
                {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 px-1 mb-1">มาสคอตของฉัน</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {MASCOTS.map((m) => (
                <button
                  key={m}
                  onClick={() => pick(m)}
                  className={`w-8 h-8 rounded-lg text-xl flex items-center justify-center transition ${m === mascot ? 'bg-amber-500/30 ring-2 ring-amber-400' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TAUNTS.map((t) => (
                <motion.button
                  key={t.id}
                  whileTap={{ scale: 0.94 }}
                  disabled={left > 0}
                  onClick={() => fire(t)}
                  className="flex items-center gap-1.5 px-2 py-2 rounded-xl bg-zinc-800 hover:bg-amber-500/25 border border-zinc-700 hover:border-amber-400 text-xs text-left disabled:opacity-40 transition"
                >
                  <span className="text-lg">{t.face}</span>
                  <span className="truncate">{t.text}</span>
                </motion.button>
              ))}
            </div>
            {left > 0 && <p className="text-[11px] text-amber-300 mt-2 text-center">รออีก {Math.ceil(left / 1000)} วินาที</p>}
            {err && <p className="text-[11px] text-red-400 mt-1 text-center">{err}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
