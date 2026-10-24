'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Mic, MicOff, Radio, Volume2, VolumeX } from 'lucide-react';
import { socket } from '@/lib/socket';
import { playBytesViaWebAudio, playUrl } from '@/lib/sounds';
import { announcePanel, useClosesOnOtherPanel } from '@/lib/panels';
import { EV, VOICE_COOLDOWN_MS, VOICE_MAX_BYTES, VOICE_MAX_MS } from '@cma/shared';

const MUTE_KEY = 'cma:voice-mute';
const isMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
};
const MIME_PREFS = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_PREFS.find((m) => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  });
}

function Bars({ big = false, color = 'bg-cyan-300' }: { big?: boolean; color?: string }) {
  return (
    <span className={`inline-flex items-end gap-[3px] ${big ? 'h-6' : 'h-4'}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`fx-bar h-full ${big ? 'w-1.5' : 'w-1'} rounded-full ${color}`} style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </span>
  );
}

type Toast = { text: string; tone: 'info' | 'error' };

/** Push-to-talk walkie-talkie: hold to record (max 5 s), release to send to everyone in the room. */
export function VoiceButton({ roomVoiceEnabled, canToggleRoom }: { roomVoiceEnabled: boolean; canToggleRoom: boolean }) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'sending'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [coolUntil, setCoolUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<Toast | null>(null);
  const [menu, setMenu] = useState(false);
  const [muted, setMuted] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const released = useRef(false);
  const timers = useRef<{ auto?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});

  useClosesOnOtherPanel('voice', () => setMenu(false));
  useEffect(() => setMuted(isMuted()), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (coolUntil <= Date.now()) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= coolUntil) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [coolUntil]);
  useEffect(() => () => cleanup(), []);

  const coolLeft = Math.max(0, coolUntil - now);
  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  function cleanup() {
    if (timers.current.auto) clearTimeout(timers.current.auto);
    if (timers.current.tick) clearInterval(timers.current.tick);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function start() {
    if (state !== 'idle') return;
    if (!roomVoiceEnabled) return setToast({ text: 'ห้องนี้ปิดวิทยุอยู่', tone: 'error' });
    if (!supported) return setToast({ text: 'เบราว์เซอร์นี้อัดเสียงไม่ได้', tone: 'error' });
    if (coolLeft > 0) return setToast({ text: `รออีก ${Math.ceil(coolLeft / 1000)} วิ`, tone: 'info' });
    released.current = false;
    setState('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      if (released.current) {
        // released while the permission prompt was up
        cleanup();
        setState('idle');
        return setToast({ text: 'พร้อมแล้ว 🎙️ กดค้างไว้แล้วพูดได้เลย', tone: 'info' });
      }
      const mime = pickMime();
      const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => void finish(r.mimeType || mime || 'audio/webm');
      rec.current = r;
      r.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setState('recording');
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
      timers.current.tick = setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
      timers.current.auto = setTimeout(() => stop(), VOICE_MAX_MS);
    } catch {
      cleanup();
      setState('idle');
      setToast({ text: 'ไม่ได้รับอนุญาตให้ใช้ไมค์', tone: 'error' });
    }
  }

  function stop() {
    released.current = true;
    const r = rec.current;
    if (r && r.state !== 'inactive') r.stop();
  }

  async function finish(mime: string) {
    const dur = Date.now() - startedAt.current;
    cleanup();
    rec.current = null;
    if (dur < 400) {
      setState('idle');
      return setToast({ text: 'กดค้างไว้ระหว่างพูดนะ', tone: 'info' });
    }
    setState('sending');
    const blob = new Blob(chunks.current, { type: mime });
    if (blob.size > VOICE_MAX_BYTES) {
      setState('idle');
      return setToast({ text: 'คลิปใหญ่เกินไป', tone: 'error' });
    }
    const data = await blob.arrayBuffer();
    socket.emit(EV.ROOM_VOICE, { mime: mime.slice(0, 90), durationMs: Math.min(Math.max(dur, 200), 6000), data }, (ack: { ok: boolean; error?: string }) => {
      setState('idle');
      if (ack?.ok) {
        setCoolUntil(Date.now() + VOICE_COOLDOWN_MS);
        setNow(Date.now());
        setToast({ text: 'ส่งเสียงให้ทั้งห้องแล้ว ✓', tone: 'info' });
      } else {
        const msg: Record<string, string> = { VOICE_COOLDOWN: 'ใจเย็นๆ รอแป๊บนึง', VOICE_DISABLED: 'ห้องนี้ปิดวิทยุอยู่', VOICE_INVALID: 'คลิปเสียงใช้ไม่ได้' };
        setToast({ text: msg[ack?.error ?? ''] ?? 'ส่งไม่สำเร็จ', tone: 'error' });
      }
    });
  }

  const toggleMute = () =>
    setMuted((v) => {
      try { localStorage.setItem(MUTE_KEY, v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  const toggleRoom = () => socket.emit(EV.ROOM_VOICE_TOGGLE, { enabled: !roomVoiceEnabled }, () => {});

  const recording = state === 'recording';
  const progress = Math.min(1, elapsed / VOICE_MAX_MS);
  const C = 2 * Math.PI * 30;

  return (
    <>
      {/* settings mini-button */}
      <m.button
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (!menu) announcePanel('voice');
          setMenu((v) => !v);
        }}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center border ${muted ? 'bg-zinc-800 border-red-500/50 text-red-300' : 'bg-zinc-800 border-zinc-600 text-zinc-300'}`}
        title="ตั้งค่าวิทยุ"
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
      </m.button>

      {/* push-to-talk */}
      <div className="relative">
        <AnimatePresence>
          {(recording || state === 'starting') && (
            <m.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-2xl bg-red-600 px-3 py-1.5 text-sm font-black text-white shadow-xl flex items-center gap-2"
            >
              {recording ? (
                <>
                  <Bars color="bg-white" /> ปล่อยเพื่อส่ง · {(elapsed / 1000).toFixed(1)} / {VOICE_MAX_MS / 1000} วิ
                </>
              ) : (
                'กำลังเปิดไมค์...'
              )}
            </m.div>
          )}
          {toast && !recording && (
            <m.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-2xl px-3 py-1.5 text-xs font-bold shadow-xl ${toast.tone === 'error' ? 'bg-red-950 border border-red-500/60 text-red-200' : 'bg-zinc-900 border border-cyan-400/50 text-cyan-100'}`}
            >
              {toast.text}
            </m.div>
          )}
        </AnimatePresence>

        <m.button
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            void start();
          }}
          onPointerUp={() => stop()}
          onPointerCancel={() => stop()}
          onContextMenu={(e) => e.preventDefault()}
          animate={recording ? { scale: 1.12 } : { scale: 1 }}
          style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 select-none ${
            !roomVoiceEnabled
              ? 'bg-zinc-800 border-zinc-600 text-zinc-500'
              : recording
                ? 'bg-gradient-to-b from-red-500 to-red-700 border-red-200 text-white shadow-[0_0_30px_rgba(239,68,68,0.8)]'
                : coolLeft > 0
                  ? 'bg-zinc-800 border-cyan-700 text-cyan-300/60'
                  : 'bg-gradient-to-b from-cyan-400 to-sky-700 border-cyan-200/60 text-white shadow-[0_3px_0_0_rgba(8,47,73,0.7),0_8px_22px_-4px_rgba(14,165,233,0.6)]'
          }`}
          title="กดค้างเพื่อพูด (สูงสุด 5 วิ) — ได้ยินทั้งห้อง"
          aria-label="กดค้างเพื่อพูด"
        >
          {recording && (
            <>
              <span className="fx-ping absolute inset-0 rounded-full border-4 border-red-400" />
              <svg className="absolute -inset-1 w-[calc(100%+0.5rem)] h-[calc(100%+0.5rem)] -rotate-90" viewBox="0 0 68 68">
                <circle cx="34" cy="34" r="30" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
              </svg>
            </>
          )}
          {!roomVoiceEnabled ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          {coolLeft > 0 && !recording && roomVoiceEnabled && (
            <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/85 text-[10px] font-bold text-white flex items-center justify-center">{Math.ceil(coolLeft / 1000)}</span>
          )}
          {state === 'idle' && coolLeft === 0 && roomVoiceEnabled && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-1.5 text-[9px] font-bold text-cyan-200">กดค้าง</span>
          )}
        </m.button>
      </div>

      <AnimatePresence>
        {menu && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-3 sm:right-5 z-[61] w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl space-y-2"
          >
            <p className="text-xs text-zinc-400 px-1">📻 วิทยุสื่อสาร — กดปุ่มไมค์ค้างไว้แล้วพูด (สูงสุด {VOICE_MAX_MS / 1000} วิ) ทุกคนในห้องได้ยิน · ไม่มีการบันทึกเก็บไว้</p>
            <button onClick={toggleMute} className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm">
              <span className="flex items-center gap-2">{muted ? <VolumeX className="w-4 h-4 text-red-300" /> : <Volume2 className="w-4 h-4 text-cyan-300" />} เสียงวิทยุบนเครื่องนี้</span>
              <span className={muted ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'}>{muted ? 'ปิด' : 'เปิด'}</span>
            </button>
            {canToggleRoom && (
              <button onClick={toggleRoom} className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm">
                <span className="flex items-center gap-2">{roomVoiceEnabled ? <Mic className="w-4 h-4 text-cyan-300" /> : <MicOff className="w-4 h-4 text-red-300" />} วิทยุทั้งห้อง</span>
                <span className={roomVoiceEnabled ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>{roomVoiceEnabled ? 'เปิด' : 'ปิด'}</span>
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

type Speaking = { key: string; playerId: string; nickname: string; until: number; x: number; y: number; anchored: boolean; failed?: boolean; muted?: boolean };

/** Plays incoming voice clips and shows who is talking (above their seat, or a top pill). */
export function VoiceLayer({ big = false }: { big?: boolean }) {
  const [items, setItems] = useState<Speaking[]>([]);
  useEffect(() => {
    async function onVoice(ev: { playerId: string; nickname: string; mime: string; durationMs: number; data: ArrayBuffer; at: number }) {
      const el = document.querySelector<HTMLElement>(`[data-seat="${CSS.escape(ev.playerId)}"]`);
      const r = el?.getBoundingClientRect();
      const visible = !!r && r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      const key = `${ev.playerId}-${ev.at}`;
      const muted = isMuted();
      const item: Speaking = {
        key, playerId: ev.playerId, nickname: ev.nickname, until: Date.now() + ev.durationMs, muted,
        x: visible ? Math.min(Math.max(r!.left + r!.width / 2, 100), window.innerWidth - 100) : window.innerWidth / 2,
        y: visible ? Math.max(r!.top, 120) : 80,
        anchored: visible,
      };
      setItems((l) => [...l.filter((s) => s.playerId !== ev.playerId), item]);
      setTimeout(() => setItems((l) => l.filter((s) => s.key !== key)), ev.durationMs + 900);
      if (muted) return;
      const url = URL.createObjectURL(new Blob([ev.data], { type: ev.mime }));
      let ok = await playUrl(url, 1);
      if (!ok) ok = await playBytesViaWebAudio(ev.data);
      setTimeout(() => URL.revokeObjectURL(url), ev.durationMs + 3000);
      if (!ok) setItems((l) => l.map((s) => (s.key === key ? { ...s, failed: true } : s)));
    }
    socket.on(EV.ROOM_VOICE, onVoice);
    return () => {
      socket.off(EV.ROOM_VOICE, onVoice);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[74] pointer-events-none">
      <AnimatePresence>
        {items.map((s) => (
          <m.div
            key={s.key}
            className="absolute"
            style={{ left: s.x, top: s.y }}
            initial={{ opacity: 0, scale: 0.5, x: '-50%', y: s.anchored ? '-80%' : '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: s.anchored ? '-115%' : '-50%' }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <div className={`flex items-center gap-2 rounded-full border-2 border-cyan-300 bg-sky-950/95 text-white font-black shadow-[0_0_24px_rgba(34,211,238,0.6)] ${big ? 'px-5 py-2.5 text-xl' : 'px-3 py-1.5 text-sm'}`}>
              <span className="fx-pulse inline-block">🎙️</span>
              <span className="max-w-[10rem] truncate">{s.nickname}</span>
              {s.failed ? <span className="text-xs text-red-300">เล่นไม่ได้</span> : s.muted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Bars big={big} />}
            </div>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
