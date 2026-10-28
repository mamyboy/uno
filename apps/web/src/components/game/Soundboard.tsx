'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { BellOff, Bell, Flame, Music, Play, Search, Star, Volume2, X } from 'lucide-react';
import { socket } from '@/lib/socket';
import { announcePanel, useClosesOnOtherPanel } from '@/lib/panels';
import { getFavorites, getUsage, loadCatalog, playClip, recordUsage, soundLabel, toggleFavorite, type CatalogItem } from '@/lib/sounds';
import { EV } from '@cma/shared';

type Tab = 'FAV' | 'TOP' | 'ALL';

// Mute ONLY soundboard clips other people trigger (card pops, combo hits, voice radio, taunts and
// every other game sound keep playing). Per device.
const SB_MUTE_KEY = 'cma:sb-mute';
export const isSoundboardMuted = () => {
  try { return localStorage.getItem(SB_MUTE_KEY) === '1'; } catch { return false; }
};

/** Dock button: 🔔 / 🔕 for soundboard clips only. */
export function SoundboardMute() {
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(isSoundboardMuted()), []);
  const toggle = () => {
    const next = !muted;
    try { localStorage.setItem(SB_MUTE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    setMuted(next);
  };
  return (
    <button
      onClick={toggle}
      className={`w-10 h-10 rounded-full border flex items-center justify-center shadow-lg transition ${
        muted ? 'bg-zinc-800 border-red-400/60 text-red-300' : 'bg-zinc-800/90 border-zinc-600 text-zinc-200'
      }`}
      title={muted ? 'เปิดเสียง Soundboard' : 'ปิดเสียง Soundboard (เสียงเกม/วิทยุ ยังดังปกติ)'}
      aria-pressed={muted}
    >
      {muted ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
    </button>
  );
}
const PAGE = 80;

/** Floating soundboard — every clip from myinstants.com/en/index/th (all pages). Tap a clip to
 * play it for everyone in the room; ⭐ pins it to Favorites, 🔥 lists your most-used, ▶ previews
 * just for you. Favorites/usage are remembered per device. */
export function Soundboard() {
  const [open, setOpen] = useState(false);
  useClosesOnOtherPanel('sound', () => setOpen(false));
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('FAV');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [favs, setFavs] = useState<CatalogItem[]>([]);
  const [usage, setUsage] = useState<ReturnType<typeof getUsage>>({});
  const [limit, setLimit] = useState(PAGE);
  const [seed, setSeed] = useState(0); // bumps every time the 'ทั้งหมด' tab is opened → new random order

  useEffect(() => {
    setFavs(getFavorites());
    setUsage(getUsage());
    if (getFavorites().length === 0) setTab('ALL');
  }, []);

  useEffect(() => {
    if (open && catalog.length === 0) void loadCatalog().then(setCatalog);
  }, [open, catalog.length]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    function onPlay({ soundId, label, byNickname }: { soundId: string; label?: string; byNickname: string }) {
      const muted = isSoundboardMuted();
      if (!muted) playClip(soundId);
      setToast(`${byNickname || 'ใครสักคน'} กด "${soundLabel(soundId, label)}" ${muted ? '🔇' : '🔊'}`);
      if (t) clearTimeout(t);
      t = setTimeout(() => setToast(''), 2200);
    }
    socket.on(EV.ROOM_PLAY_SOUND, onPlay);
    return () => {
      socket.off(EV.ROOM_PLAY_SOUND, onPlay);
      if (t) clearTimeout(t);
    };
  }, []);

  useEffect(() => setLimit(PAGE), [q, tab]);

  const favSet = useMemo(() => new Set(favs.map((x) => x.f)), [favs]);
  const top = useMemo(
    () =>
      Object.entries(usage)
        .sort((a, b) => b[1].n - a[1].n || b[1].at - a[1].at)
        .slice(0, 40)
        .map(([f, v]) => ({ f, t: v.t, n: v.n })),
    [usage],
  );

  const shuffled = useMemo(() => {
    void seed;
    const a = [...catalog];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [catalog, seed]);

  const list: (CatalogItem & { n?: number })[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = tab === 'FAV' ? favs : tab === 'TOP' ? top : shuffled;
    return needle ? base.filter((x) => x.t.toLowerCase().includes(needle) || x.f.includes(needle)) : base;
  }, [q, tab, favs, top, shuffled]);

  const trigger = (item: CatalogItem) => {
    socket.emit(EV.ROOM_PLAY_SOUND, { soundId: item.f, label: item.t.slice(0, 80) }, () => {});
    recordUsage(item);
    setUsage(getUsage());
  };

  const tabs: { id: Tab; label: string; icon: ReactNode; count: number }[] = [
    { id: 'FAV', label: 'โปรด', icon: <Star className="w-3.5 h-3.5" />, count: favs.length },
    { id: 'TOP', label: 'ใช้บ่อย', icon: <Flame className="w-3.5 h-3.5" />, count: top.length },
    { id: 'ALL', label: 'สุ่มทั้งหมด', icon: <Music className="w-3.5 h-3.5" />, count: catalog.length },
  ];

  return (
    <>
      <AnimatePresence>
        {toast && (
          <m.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-black/85 border border-white/10 text-sm font-semibold shadow-xl max-w-[90vw] truncate"
          >
            {toast}
          </m.div>
        )}
      </AnimatePresence>

      <m.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => {
          if (!open) announcePanel('sound');
          setOpen((v) => !v);
          setSeed((s) => s + 1);
        }}
        className="relative w-12 h-12 rounded-full bg-gradient-to-b from-fuchsia-500 to-fuchsia-700 border border-fuchsia-300/40 flex items-center justify-center shadow-[0_3px_0_0_rgba(90,10,95,0.6),0_8px_20px_-4px_rgba(192,38,211,0.5)]"
        title="กดเสียงแกล้งเพื่อนในห้อง"
      >
        {open ? <X className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </m.button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-3 sm:right-5 z-[60] w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl bg-zinc-900/95 border border-zinc-700 p-3 shadow-2xl"
          >
            <p className="text-xs text-zinc-400 mb-2 px-1">แตะเพื่อเล่นให้ทุกคนในห้อง 🔊 · ⭐ เพิ่มรายการโปรด · myinstants.com</p>
            <div className="flex gap-1 mb-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    if (t.id === 'ALL') setSeed((s) => s + 1);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    tab === t.id ? 'bg-fuchsia-600/30 border-fuchsia-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.icon} {t.label}
                  {t.count > 0 && <span className="text-[10px] opacity-70">{t.count.toLocaleString('th-TH')}</span>}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700">
              <Search className="w-3.5 h-3.5 text-zinc-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเสียง..." className="bg-transparent outline-none text-sm flex-1 min-w-0" />
            </label>

            <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
              {tab === 'ALL' && catalog.length === 0 && <p className="text-xs text-zinc-500 p-2">กำลังโหลดรายการเสียง...</p>}
              {tab === 'FAV' && favs.length === 0 && <p className="text-xs text-zinc-500 p-2">ยังไม่มีรายการโปรด — ไปที่แท็บ "ทั้งหมด" แล้วกด ⭐</p>}
              {tab === 'TOP' && top.length === 0 && <p className="text-xs text-zinc-500 p-2">ยังไม่มีเสียงที่ใช้บ่อย</p>}
              {list.slice(0, limit).map((item) => {
                const fav = favSet.has(item.f);
                return (
                  <div key={item.f} className="flex items-center gap-1">
                    <m.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => trigger(item)}
                      className="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-fuchsia-600/30 border border-zinc-700 hover:border-fuchsia-500 text-xs text-left transition truncate"
                      title={item.t}
                    >
                      🔊 {item.t}
                      {'n' in item && item.n ? <span className="text-[10px] text-zinc-500"> · {item.n}×</span> : null}
                    </m.button>
                    <button onClick={() => playClip(item.f, 0.7)} title="ฟังเฉพาะเรา" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setFavs(toggleFavorite({ f: item.f, t: item.t }))} title={fav ? 'เอาออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'} className="p-2 rounded-lg hover:bg-zinc-800">
                      <Star className={`w-4 h-4 ${fav ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-500'}`} />
                    </button>
                  </div>
                );
              })}
              {list.length > limit && (
                <button onClick={() => setLimit((l) => l + PAGE)} className="w-full py-2 text-xs text-fuchsia-300 hover:text-white">
                  แสดงเพิ่ม ({(list.length - limit).toLocaleString('th-TH')} เสียง)
                </button>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
