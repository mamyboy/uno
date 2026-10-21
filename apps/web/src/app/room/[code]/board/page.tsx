'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Trophy } from 'lucide-react';
import { socket } from '@/lib/socket';
import { EV, type Card, type GameState, type Room, type GameResult, type Player } from '@cma/shared';
import { PlayingCard } from '@/components/game/PlayingCard';
import { Confetti } from '@/components/game/Confetti';
import { ActionEffect } from '@/components/game/ActionEffect';
import { Soundboard } from '@/components/game/Soundboard';

const COLOR_LABEL: Record<string, string> = { RED: 'แดง', YELLOW: 'เหลือง', GREEN: 'เขียว', BLUE: 'น้ำเงิน' };
const COLOR_SWATCH: Record<string, string> = {
  RED: 'bg-red-500', YELLOW: 'bg-yellow-400', GREEN: 'bg-emerald-500', BLUE: 'bg-blue-500',
};

function Avatar({ nickname, avatar, size = 'md' }: { nickname: string; avatar?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-11 h-11 text-xs';
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={nickname} className={`${dims} rounded-full object-cover border-2 border-white/20`} />;
  }
  return (
    <span className={`${dims} rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center font-bold`}>
      {nickname.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function BoardPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState('');
  const [effectCard, setEffectCard] = useState<Card | null>(null);
  const [finishNotice, setFinishNotice] = useState('');
  const lastTopCardId = useRef<string | null>(null);
  const lastFinishedCount = useRef(0);

  // Flash a big banner whenever an Action/Wild card lands on top of the discard pile.
  useEffect(() => {
    const top = game?.topCard;
    if (!top || top.id === lastTopCardId.current) return;
    lastTopCardId.current = top.id;
    if (top.kind === 'NUMBER') return;
    setEffectCard(top);
    const t = setTimeout(() => setEffectCard(null), 1300);
    return () => clearTimeout(t);
  }, [game?.topCard?.id]);

  // Flash a banner the instant a player's hand empties, announcing their finish rank.
  useEffect(() => {
    const order = game?.finishedOrder ?? [];
    if (order.length <= lastFinishedCount.current) {
      lastFinishedCount.current = order.length;
      return;
    }
    const rank = order.length;
    const finishedId = order[rank - 1];
    const nickname = room?.players.find((p) => p.id === finishedId)?.nickname ?? 'ผู้เล่น';
    lastFinishedCount.current = order.length;
    setFinishNotice(`🏆 ${nickname} ไพ่หมดแล้ว! ชนะอันดับที่ ${rank}`);
    const t = setTimeout(() => setFinishNotice(''), 3500);
    return () => clearTimeout(t);
  }, [game?.finishedOrder?.length, room]);

  useEffect(() => {
    socket.emit(EV.ROOM_WATCH, { code }, (ack: any) => {
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      setRoom(ack.snapshot.room);
      setGame(ack.snapshot.game);
      setResult(ack.snapshot.result);
    });

    const onRoom = (r: Room) => setRoom(r);
    const onGame = (g: GameState) => setGame(g);
    const onOver = (res: GameResult) => setResult(res);

    socket.on(EV.ROOM_STATE_UPDATED, onRoom);
    socket.on(EV.GAME_STATE, onGame);
    socket.on(EV.GAME_GAME_OVER, onOver);

    return () => {
      socket.off(EV.ROOM_STATE_UPDATED, onRoom);
      socket.off(EV.GAME_STATE, onGame);
      socket.off(EV.GAME_GAME_OVER, onOver);
    };
  }, [code]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-casino-table text-red-400">
        {error}
      </main>
    );
  }

  if (!room) {
    return <main className="min-h-screen flex items-center justify-center bg-casino-table text-white">กำลังเชื่อมต่อ...</main>;
  }

  const players = room.players.filter((p: Player) => p.isPlayer);

  return (
    <main
      className="min-h-screen text-white flex flex-col items-center justify-center p-4 sm:p-8 gap-4 sm:gap-8 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #1a4530 0%, #0f2b1d 55%, #040a06 100%)' }}
    >
      {/* felt texture */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)' }}
      />

      {room.status === 'FINISHED' && result?.winnerId && <Confetti count={100} />}
      <ActionEffect card={effectCard} />
      <Soundboard />

      <h1 className="text-xl sm:text-3xl font-black tracking-tight relative z-10 text-center px-2">
        Color Match Arena · <span className="text-emerald-400 font-mono">{room.code}</span>
      </h1>

      <AnimatePresence>
        {finishNotice && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative z-10 px-6 py-3 rounded-xl bg-yellow-400/15 border border-yellow-400/40 text-yellow-200 text-lg font-bold text-center"
          >
            {finishNotice}
          </motion.div>
        )}
      </AnimatePresence>

      {room.leaderboard.length > 0 && (
        <div className="relative z-10 w-full max-w-lg">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur">
            <p className="flex items-center gap-2 text-sm font-semibold mb-3 text-zinc-200">
              <Trophy className="w-4 h-4 text-yellow-400" /> อันดับในห้องนี้
            </p>
            <ol className="space-y-1.5">
              {room.leaderboard.slice(0, 6).map((e, i) => (
                <li key={e.nickname} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/5">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-4">#{i + 1}</span>
                    <Avatar nickname={e.nickname} avatar={e.avatar} size="sm" />
                    <span className="text-sm">{e.nickname}</span>
                  </span>
                  <span className="text-xs text-zinc-400">
                    <span className="text-yellow-400 font-bold">{e.wins}</span> ชนะ · {e.gamesPlayed} เกม
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {room.status === 'WAITING' && (
        <div className="text-center space-y-4 relative z-10">
          <p className="text-xl text-zinc-300">กำลังรอผู้เล่น ({players.length}/{room.maxPlayers})</p>
          <div className="flex gap-4 flex-wrap justify-center">
            {players.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 font-bold backdrop-blur"
              >
                <Avatar nickname={p.nickname} avatar={p.avatar} size="sm" />
                {p.nickname}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {room.status === 'PLAYING' && game && (
        <div className="w-full max-w-4xl space-y-4 sm:space-y-8 relative z-10 px-1">
          <div className="flex items-center justify-center gap-3 sm:gap-8 flex-wrap">
            <div className="text-center space-y-2">
              <p className="text-sm text-zinc-400">กองจั่ว</p>
              <PlayingCard card={game.topCard} faceDown size="lg" />
              <p className="text-xs text-zinc-500">{game.drawPileCount} ใบ</p>
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-zinc-400">ไพ่กลาง</p>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={game.topCard.id}
                  initial={{ opacity: 0, scale: 0.4, rotate: -30, y: -30 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <PlayingCard card={game.topCard} size="lg" />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-zinc-400">ทิศทาง</p>
              <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl sm:text-3xl ${game.direction ? 'animate-spin-slow' : ''}`}>
                {game.direction === 'RIGHT' ? '⟳' : game.direction === 'LEFT' ? '⟲' : '?'}
              </div>
            </div>
          </div>

          {game.topCard.color && (
            <div className="flex items-center justify-center gap-2 text-base">
              <span className="text-zinc-400">สีที่ต้องเล่น:</span>
              <span className={`w-5 h-5 rounded-full ${COLOR_SWATCH[game.topCard.color]} ring-2 ring-white/30`} />
              <span className="font-bold">{COLOR_LABEL[game.topCard.color]}</span>
              {(game.topCard.kind === 'WILD' || game.topCard.kind === 'WILD_DRAW_TWO' || game.topCard.kind === 'WILD_DRAW_FOUR' || game.topCard.kind === 'WILD_DRAW_EIGHT') && (
                <span className="text-sm text-purple-300">(เลือกจากไพ่เปลี่ยนสี)</span>
              )}
            </div>
          )}

          <motion.div
            key={game.gameStatus === 'CHOOSING_DIRECTION' ? 'choosing' : game.currentPlayerId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-2xl font-bold"
          >
            {game.gameStatus === 'CHOOSING_DIRECTION'
              ? `${players.find((p) => p.id === game.firstPlayerId)?.nickname ?? ''} กำลังเลือกทิศทาง...`
              : `ตาของ ${players.find((p) => p.id === game.currentPlayerId)?.nickname ?? '-'}`}
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {players.map((p) => {
              const isCurrent = p.id === game.currentPlayerId;
              const finishRank = game.finishedOrder.indexOf(p.id);
              const hasFinished = finishRank >= 0;
              return (
                <motion.div
                  key={p.id}
                  animate={isCurrent && !hasFinished ? { scale: [1, 1.04, 1] } : {}}
                  transition={{ duration: 1.3, repeat: isCurrent && !hasFinished ? Infinity : 0 }}
                  className={`rounded-2xl p-4 text-center border-2 ${
                    hasFinished
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : isCurrent ? 'border-emerald-400 bg-emerald-400/10 animate-turn-ring' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="relative inline-block">
                    <Avatar nickname={p.nickname} avatar={p.avatar} size="md" />
                    {hasFinished && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-bold flex items-center justify-center ring-2 ring-black/40">
                        {finishRank + 1}
                      </span>
                    )}
                  </div>
                  <p className="font-bold mt-1">{p.nickname}</p>
                  <p className={hasFinished ? 'text-sm text-yellow-300 font-semibold' : 'text-sm text-zinc-400'}>
                    {hasFinished ? `ชนะอันดับที่ ${finishRank + 1}` : `${p.cardCount} ใบ`}
                  </p>
                  {!p.connected && <p className="text-xs text-red-400">หลุดการเชื่อมต่อ</p>}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {result && room.status !== 'PLAYING' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4 relative z-10"
        >
          <motion.div
            animate={{ y: [0, -16, 0], rotate: [0, -10, 10, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.5 }}
            className="flex justify-center"
          >
            <Trophy className="w-20 h-20 text-yellow-400 drop-shadow-lg" />
          </motion.div>
          <h2 className="text-4xl font-black text-yellow-400">
            {result.ranking.find((r) => r.playerId === result.winnerId)?.nickname} ชนะ!
          </h2>
          <p className="text-zinc-400">ใช้ {result.turns} ตา · {Math.round(result.durationMs / 1000)} วินาที</p>
        </motion.div>
      )}
    </main>
  );
}