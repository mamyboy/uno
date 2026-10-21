'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, X } from 'lucide-react';
import { socket } from '@/lib/socket';
import { EV, SOUND_IDS, type SoundId } from '@cma/shared';

const EMOJI: Record<SoundId, string> = {
  'ไอ้สัด': '😤',
  'ผมขอโทษครับพี่': '🙏',
  'จ๊ะเอ๋ตัวเอง': '🫣',
  'สิ่งศักดิ์สิทธิ์': '🙇',
  'เสียงน้าค้อม': '🎙️',
  'อดีตเบต้าเทสเตอร์': '🎮',
  'ไม่ไหวแล้ว': '🥵',
};

/** Floating soundboard: trigger a clip for everyone in the room, and play whatever anyone
 * else triggers. Lives independently of game state — works in the lobby and mid-game alike. */
export function Soundboard() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    function onPlay({ soundId, byNickname }: { soundId: SoundId; byNickname: string }) {
      const audio = new Audio(`/sounds/${encodeURIComponent(soundId)}.mp3`);
      audio.volume = 0.9;
      void audio.play().catch(() => {});
      setToast(`${byNickname || 'ใครสักคน'} กด "${soundId}" ${EMOJI[soundId] ?? '🔊'}`);
      const t = setTimeout(() => setToast(''), 2200);
      return () => clearTimeout(t);
    }
    socket.on(EV.ROOM_PLAY_SOUND, onPlay);
    return () => {
      socket.off(EV.ROOM_PLAY_SOUND, onPlay);
    };
  }, []);

  const trigger = (soundId: SoundId) => {
    socket.emit(EV.ROOM_PLAY_SOUND, { soundId }, () => {});
  };

  return (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-black/80 border border-white/10 text-sm font-semibold shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-gradient-to-b from-fuchsia-500 to-fuchsia-700 hover:from-fuchsia-500 hover:to-fuchsia-600 border border-fuchsia-300/40 flex items-center justify-center shadow-[0_3px_0_0_rgba(90,10,95,0.6),0_8px_20px_-4px_rgba(192,38,211,0.5)] active:translate-y-[2px] active:shadow-none"
        title="กดแกล้งเพื่อนในห้อง"
      >
        {open ? <X className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-5 z-[60] w-64 rounded-2xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl backdrop-blur"
          >
            <p className="text-xs text-zinc-400 mb-2 px-1">กดเสียงแกล้งทุกคนในห้อง 🔊</p>
            <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto">
              {SOUND_IDS.map((id) => (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => trigger(id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-fuchsia-600/30 border border-zinc-700 hover:border-fuchsia-500 text-sm text-left transition"
                >
                  <span className="text-lg">{EMOJI[id] ?? '🔊'}</span>
                  <span className="truncate">{id}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <audio ref={audioRef} className="hidden" />
    </>
  );
}
