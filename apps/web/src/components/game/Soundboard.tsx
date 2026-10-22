'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Volume2, X } from 'lucide-react';
import { socket } from '@/lib/socket';
import { playClip, soundLabel } from '@/lib/sounds';
import { EV, SOUND_IDS, type SoundId } from '@cma/shared';

/** Floating soundboard (clips from myinstants.com/en/index/th): trigger a clip for everyone in
 * the room, and play whatever anyone else triggers. Works in the lobby and mid-game alike. */
export function Soundboard() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    function onPlay({ soundId, byNickname }: { soundId: SoundId; byNickname: string }) {
      playClip(soundId);
      setToast(`${byNickname || 'ใครสักคน'} กด "${soundLabel(soundId)}" 🔊`);
      if (t) clearTimeout(t);
      t = setTimeout(() => setToast(''), 2200);
    }
    socket.on(EV.ROOM_PLAY_SOUND, onPlay);
    return () => {
      socket.off(EV.ROOM_PLAY_SOUND, onPlay);
      if (t) clearTimeout(t);
    };
  }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SOUND_IDS.filter((id) => !needle || soundLabel(id).toLowerCase().includes(needle));
  }, [q]);

  const trigger = (soundId: SoundId) => socket.emit(EV.ROOM_PLAY_SOUND, { soundId }, () => {});

  return (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-black/85 border border-white/10 text-sm font-semibold shadow-xl max-w-[90vw] truncate"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-gradient-to-b from-fuchsia-500 to-fuchsia-700 border border-fuchsia-300/40 flex items-center justify-center shadow-[0_3px_0_0_rgba(90,10,95,0.6),0_8px_20px_-4px_rgba(192,38,211,0.5)]"
        title="กดเสียงแกล้งเพื่อนในห้อง"
      >
        {open ? <X className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-5 z-[60] w-72 rounded-2xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl backdrop-blur"
          >
            <p className="text-xs text-zinc-400 mb-2 px-1">เสียงแกล้งทุกคนในห้อง 🔊 · myinstants.com</p>
            <label className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700">
              <Search className="w-3.5 h-3.5 text-zinc-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเสียง..." className="bg-transparent outline-none text-sm flex-1 min-w-0" />
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto pr-1">
              {list.map((id) => (
                <motion.button
                  key={id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => trigger(id)}
                  className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-fuchsia-600/30 border border-zinc-700 hover:border-fuchsia-500 text-xs text-left transition truncate"
                  title={soundLabel(id)}
                >
                  🔊 {soundLabel(id)}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
