'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Bell, BellOff, Mic, MicOff, Radio, SlidersHorizontal, Smile, VolumeX, X } from 'lucide-react';
import { EV } from '@cma/shared';
import { socket } from '@/lib/socket';
import { announcePanel, useClosesOnOtherPanel } from '@/lib/panels';

/** Per-device mute switches (read at play time by Soundboard / Taunts / Voice). */
const KEYS = { soundboard: 'cma:sb-mute', taunt: 'cma:taunt-mute', voice: 'cma:voice-mute' } as const;
type K = keyof typeof KEYS;
const read = (k: K) => {
  try { return localStorage.getItem(KEYS[k]) === '1'; } catch { return false; }
};

function Row({ icon, label, hint, on, onClick, disabled }: { icon: ReactNode; label: string; hint?: string; on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:hover:bg-zinc-800 disabled:opacity-60 text-sm text-left"
    >
      <span className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="min-w-0">
          <span className="block font-semibold">{label}</span>
          {hint && <span className="block text-[11px] text-zinc-400">{hint}</span>}
        </span>
      </span>
      <span className={`shrink-0 relative w-11 h-6 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

/** One dock button 🎚️ for every sound / radio on-off switch. */
export function SoundSettings({ roomVoiceEnabled, canToggleRoom, showRoomVoice = true }: { roomVoiceEnabled?: boolean; canToggleRoom?: boolean; showRoomVoice?: boolean }) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState<Record<K, boolean>>({ soundboard: false, taunt: false, voice: false });
  useClosesOnOtherPanel('settings', () => setOpen(false));
  useEffect(() => setMuted({ soundboard: read('soundboard'), taunt: read('taunt'), voice: read('voice') }), []);
  const flip = (k: K) =>
    setMuted((s) => {
      const next = { ...s, [k]: !s[k] };
      try { localStorage.setItem(KEYS[k], next[k] ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  const anyMuted = muted.soundboard || muted.taunt || muted.voice;
  const toggleRoom = () => socket.emit(EV.ROOM_VOICE_TOGGLE, { enabled: !roomVoiceEnabled }, () => {});

  return (
    <>
      <m.button
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (!open) announcePanel('settings');
          setOpen((v) => !v);
        }}
        className={`relative w-10 h-10 rounded-full flex items-center justify-center border shadow-lg ${anyMuted ? 'bg-zinc-800 border-red-400/60 text-red-300' : 'bg-zinc-800 border-zinc-600 text-zinc-200'}`}
        title="ตั้งค่าเสียง & วิทยุ"
        aria-label="ตั้งค่าเสียง & วิทยุ"
      >
        {open ? <X className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
        {anyMuted && !open && <VolumeX className="absolute -top-1 -right-1 w-4 h-4 p-0.5 rounded-full bg-red-500 text-white" />}
      </m.button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-3 sm:right-5 z-[61] w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl space-y-2"
          >
            <p className="text-sm font-bold px-1">🎚️ เสียง & วิทยุ</p>
            <p className="text-[11px] text-zinc-500 px-1 -mt-1">เฉพาะเครื่องนี้ · เสียงลงไพ่ (pop) และเสียงคอมโบดังเสมอ</p>
            <Row
              icon={muted.soundboard ? <BellOff className="w-4 h-4 text-red-300" /> : <Bell className="w-4 h-4 text-fuchsia-300" />}
              label="เสียง Soundboard"
              hint="เสียงที่เพื่อนกดจากปุ่ม 🔊"
              on={!muted.soundboard}
              onClick={() => flip('soundboard')}
            />
            <Row
              icon={<Smile className={`w-4 h-4 ${muted.taunt ? 'text-red-300' : 'text-amber-300'}`} />}
              label="เสียงล้อเลียน"
              hint="เสียงจากปุ่ม 😜 (ยังเห็นมาสคอต)"
              on={!muted.taunt}
              onClick={() => flip('taunt')}
            />
            <Row
              icon={<Radio className={`w-4 h-4 ${muted.voice ? 'text-red-300' : 'text-cyan-300'}`} />}
              label="เสียงวิทยุบนเครื่องนี้"
              hint="ได้ยินเพื่อนพูดผ่านวิทยุ"
              on={!muted.voice}
              onClick={() => flip('voice')}
            />
            {showRoomVoice && (
              <Row
                icon={roomVoiceEnabled ? <Mic className="w-4 h-4 text-cyan-300" /> : <MicOff className="w-4 h-4 text-red-300" />}
                label="วิทยุทั้งห้อง"
                hint={canToggleRoom ? 'เปิด/ปิดปุ่มพูดของทุกคน' : 'เฉพาะเจ้าของห้องเปลี่ยนได้'}
                on={!!roomVoiceEnabled}
                onClick={canToggleRoom ? toggleRoom : undefined}
                disabled={!canToggleRoom}
              />
            )}
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
