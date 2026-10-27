'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { m } from 'motion/react';
import { ArrowLeft, Loader2, LogIn, Trash2, Trophy, UserX, Users } from 'lucide-react';
import { socket } from '@/lib/socket';
import { setSession } from '@/lib/session';
import { getProfile, saveProfile } from '@/lib/profile';
import { EV, type StaticRoomSummary } from '@cma/shared';
import { Button } from '@/components/ui/Button';

export default function JoinRoomPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [staticRooms, setStaticRooms] = useState<StaticRoomSummary[]>([]);

  // Remembered from a previous visit on this device — still fully editable below.
  useEffect(() => {
    const saved = getProfile();
    if (saved?.nickname) setNickname(saved.nickname);
  }, []);

  useEffect(() => {
    const fetchRooms = () => socket.emit(EV.ROOM_LIST, {}, (ack: any) => {
      if (ack.ok) setStaticRooms(ack.rooms);
    });
    fetchRooms();
    const interval = setInterval(fetchRooms, 4000);
    return () => clearInterval(interval);
  }, []);

  const doJoin = (joinCode: string) => {
    if (!nickname.trim()) {
      setError('กรุณากรอกชื่อเล่นก่อนเลือกห้อง');
      return;
    }
    setLoading(true);
    setError('');
    socket.emit(EV.ROOM_JOIN, { code: joinCode.toUpperCase(), nickname }, (ack: any) => {
      setLoading(false);
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      saveProfile({ nickname });
      setSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
      router.push(`/room/${ack.code}`);
    });
  };

  const refreshRooms = () =>
    socket.emit(EV.ROOM_LIST, {}, (listAck: any) => {
      if (listAck.ok) setStaticRooms(listAck.rooms);
    });

  const clearStaticRoom = (roomCode: string, roomName: string) => {
    if (!window.confirm(`เคลียร์ห้อง "${roomName}" (${roomCode})? จะเตะผู้เล่นทุกคนออกให้ห้องว่าง (Leaderboard ยังอยู่)`)) return;
    socket.emit(EV.ROOM_CLEAR_BY_CODE, { code: roomCode }, (ack: any) => {
      if (!ack.ok) return setError(ack.error);
      refreshRooms();
    });
  };

  const clearRoomLeaderboard = (roomCode: string, roomName: string) => {
    if (!window.confirm(`ล้าง Leaderboard ของ "${roomName}" (${roomCode}) ทั้งหมด?`)) return;
    socket.emit(EV.ROOM_CLEAR_LEADERBOARD, { code: roomCode }, (ack: any) => {
      if (!ack.ok) return setError(ack.error);
      refreshRooms();
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !nickname.trim()) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    doJoin(code);
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
            <LogIn className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">เข้าร่วมห้อง</h1>
            <p className="text-zinc-400 text-sm">เลือกห้อง Static ด้านล่าง หรือกรอกรหัสห้อง</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="mb-5 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            ชื่อเล่นของคุณ
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="เช่น เกมเมอร์"
            className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
            maxLength={16}
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            ห้อง Static — กดเพื่อเข้าร่วมทันที
          </label>
          <div className="space-y-2">
            {staticRooms.map((r) => {
              const full = false; // no player limit
              const inGame = r.status === 'PLAYING';
              // Same name = same person: the server lets you re-claim your seat even mid-game/full.
              const disabled = loading;
              return (
                <div key={r.code} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 space-y-2">
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => doJoin(r.code)}
                    className={`flex-1 flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${
                      disabled
                        ? 'bg-zinc-800/40 border-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-800/80 border-zinc-700 hover:border-amber-400/70 hover:bg-zinc-800 text-white'
                    }`}
                  >
                    <span>
                      <span className="font-semibold">{r.name}</span>
                      <span className="block text-xs text-zinc-500 font-mono">{r.code}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <Users className="w-3.5 h-3.5" /> {r.playerCount} คน
                      {inGame && <span className="text-amber-400">กำลังเล่น · เข้ารอได้</span>}
                      {full && !inGame && <span className="text-red-400">เต็ม</span>}
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex-1 min-w-0 truncate text-zinc-400">
                    <Trophy className="inline w-3.5 h-3.5 text-yellow-400 mr-1" />
                    {r.topPlayer ? `${r.topPlayer.nickname} (${r.topPlayer.wins} ชนะ)` : 'ยังไม่มีอันดับ'}
                    {r.leaderboardCount ? ` · ${r.leaderboardCount} คน` : ''}
                  </span>
                  <button
                    type="button"
                    title="เคลียร์ห้อง: เตะผู้เล่นทุกคนออกให้ห้องว่าง"
                    onClick={() => clearStaticRoom(r.code, r.name)}
                    disabled={r.playerCount === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-orange-500/60 hover:text-orange-300 disabled:opacity-40 transition"
                  >
                    <UserX className="w-3.5 h-3.5" /> เคลียร์ห้อง
                  </button>
                  <button
                    type="button"
                    title="ล้าง Leaderboard ของห้องนี้"
                    onClick={() => clearRoomLeaderboard(r.code, r.name)}
                    disabled={!r.leaderboardCount}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-red-500/60 hover:text-red-300 disabled:opacity-40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> ล้าง Leaderboard
                  </button>
                </div>
                </div>
              );
            })}
            {staticRooms.length === 0 && (
              <p className="text-xs text-zinc-500">กำลังโหลดห้อง Static...</p>
            )}
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-4 pt-2 border-t border-zinc-800">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 mt-4">
              หรือกรอกรหัสห้อง (6 หลัก)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white tracking-widest text-center text-xl font-bold focus:outline-none focus:border-emerald-500 uppercase"
              maxLength={6}
            />
          </div>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading}>
            {loading && <Loader2 className="w-5 h-5 animate-spin" />} เข้าสู่ห้อง
          </Button>
        </form>
      </m.div>
    </main>
  );
}
