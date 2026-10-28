'use client';

import { errText } from '@/lib/errors';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { m } from 'motion/react';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { socket } from '@/lib/socket';
import { setSession } from '@/lib/session';
import { getProfile, saveProfile } from '@/lib/profile';
import { EV } from '@cma/shared';
import { Button } from '@/components/ui/Button';

export default function CreateRoomPage() {
  const router = useRouter();
  const [roomName, setRoomName] = useState('ห้องของฉัน');
  const [nickname, setNickname] = useState('');
  const [hostPlays, setHostPlays] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Remembered from a previous visit on this device — still fully editable below.
  useEffect(() => {
    const saved = getProfile();
    if (saved?.nickname) setNickname(saved.nickname);
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('กรุณากรอกชื่อเล่น');
      return;
    }
    setLoading(true);
    setError('');

    socket.emit(
      EV.ROOM_CREATE,
      { name: roomName, nickname, hostPlays },
      (ack: any) => {
        setLoading(false);
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        saveProfile({ nickname });
        setSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
        router.push(`/room/${ack.code}`);
      },
    );
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-casino-table via-casino-felt to-black">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl"
      >
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> กลับหน้าหลัก
        </Link>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">สร้างห้องใหม่</h1>
            <p className="text-zinc-400 text-sm">ตั้งค่าห้องและเริ่มชวนเพื่อน</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {errText(error)}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              ชื่อห้อง
            </label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
              required
              maxLength={40}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              ชื่อเล่นของคุณ
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="เช่น โจนส์"
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
              required
              maxLength={16}
            />
          </div>
          <p className="text-xs text-zinc-500">👥 ไม่จำกัดจำนวนผู้เล่น — เข้าได้จนกว่าจะกดเริ่มเกม</p>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-medium text-zinc-300">เข้าร่วมเล่นด้วย</span>
            <input
              type="checkbox"
              checked={hostPlays}
              onChange={(e) => setHostPlays(e.target.checked)}
              className="w-5 h-5 accent-emerald-500 rounded"
            />
          </div>
          <Button type="submit" variant="gold" size="lg" fullWidth disabled={loading}>
            {loading && <Loader2 className="w-5 h-5 animate-spin" />} สร้างห้องและเข้าสู่ Lobby
          </Button>
        </form>
      </m.div>
    </main>
  );
}