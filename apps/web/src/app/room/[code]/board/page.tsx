'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, Trophy } from 'lucide-react';
import { socket } from '@/lib/socket';
import { EV, type Card, type GameState, type Room, type GameResult, type Player } from '@cma/shared';
import { PlayingCard } from '@/components/game/PlayingCard';
import { Confetti } from '@/components/game/Confetti';
import { ActionEffect } from '@/components/game/ActionEffect';
import { Soundboard } from '@/components/game/Soundboard';
import { GameFx } from '@/components/game/GameFx';
import { useCollapse } from '@/components/game/useCollapse';
import { inFrame } from '@/lib/frameBatch';
import { avatarSrc } from '@/lib/avatar';
import { TauntButton, TauntLayer } from '@/components/game/Taunts';
import { VoiceButton, VoiceLayer } from '@/components/game/Voice';
import { DirectionFlipFlash, NextBadge, SeatArrow, SeatRow } from '@/components/game/SeatArrow';
import { nextSeatIndex } from '@cma/shared';
import { PlayHistory } from '@/components/game/PlayHistory';

const COLOR_LABEL: Record<string, string> = { RED: 'แดง', YELLOW: 'เหลือง', GREEN: 'เขียว', BLUE: 'น้ำเงิน' };
const COLOR_SWATCH: Record<string, string> = {
  RED: 'bg-red-500', YELLOW: 'bg-yellow-400', GREEN: 'bg-emerald-500', BLUE: 'bg-blue-500',
};

function Avatar({ nickname, avatar, size = 'md' }: { nickname: string; avatar?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-11 h-11 text-xs';
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarSrc(avatar)} alt={nickname} loading="lazy" decoding="async" className={`${dims} rounded-full object-cover border-2 border-white/20`} />;
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

  const [lbOpen, toggleLb] = useCollapse('cma:lb-open:board');

  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState('');
  const [effectCard, setEffectCard] = useState<Card | null>(null);
  const [finishNotice, setFinishNotice] = useState('');
  const lastTopCardId = useRef<string | null>(null);
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (effectTimer.current) clearTimeout(effectTimer.current); }, []);
  const lastFinishedCount = useRef(0);

  // Flash a big banner whenever an Action/Wild card lands on top of the discard pile.
  useEffect(() => {
    const top = game?.topCard;
    if (!top || top.id === lastTopCardId.current) return;
    lastTopCardId.current = top.id;
    if (top.kind === 'NUMBER') return;
    setEffectCard(top);
    // Timer lives in a ref: it must NOT be cancelled when an unrelated dependency changes
    // (e.g. the optimistic play being confirmed right after) — that left the banner stuck.
    if (effectTimer.current) clearTimeout(effectTimer.current);
    effectTimer.current = setTimeout(() => setEffectCard(null), 1300);
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
    // Same fix as the action banner: a room update must not cancel the hide timer.
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => setFinishNotice(''), 3500);
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

    // One move = several messages; apply them together in one frame.
    const onRoom = (r: Room) => inFrame(() => setRoom(r));
    const onGame = (g: GameState) => inFrame(() => setGame(g));
    const onOver = (res: GameResult) => inFrame(() => setResult(res));

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
  const nameOf = (id: string | null | undefined) => room.players.find((p: Player) => p.id === id)?.nickname ?? 'ผู้เล่น';
  // Seats in the CURRENT turn order (follows a Shuffle card), finished players appended after.
  const seated: Player[] = game
    ? [
        ...game.seatOrder.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p),
        ...game.finishedOrder.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p && !game.seatOrder.includes(p.id)),
        ...players.filter((p) => !game.seatOrder.includes(p.id) && !game.finishedOrder.includes(p.id)),
      ]
    : players;
  const nextId: string | null = (() => {
    if (!game || !game.direction || !game.currentPlayerId) return null;
    const n = game.seatOrder.length;
    const idx = game.seatOrder.indexOf(game.currentPlayerId);
    if (n < 2 || idx < 0) return null;
    return game.seatOrder[nextSeatIndex(idx, n, game.direction)];
  })();
  const avatarOf = (id: string | null | undefined, nickname?: string) =>
    room.players.find((p: Player) => p.id === id)?.avatar ??
    (nickname ? (room.leaderboard ?? []).find((e: any) => e.nickname?.trim().toLowerCase() === nickname.trim().toLowerCase())?.avatar : null) ??
    null;

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
      <GameFx game={game} result={result} nameOf={nameOf} avatarOf={avatarOf} />
      <TauntLayer big />
      <VoiceLayer big />
      <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-[60] flex items-center gap-2 rounded-full bg-zinc-950/85 border border-white/10 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <Soundboard />
      </div>

      <h1 className="text-xl sm:text-3xl font-black tracking-tight relative z-10 text-center px-2">
        Color Match Arena · <span className="text-emerald-400 font-mono">{room.code}</span>
      </h1>

      <AnimatePresence>
        {finishNotice && (
          <m.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative z-10 px-6 py-3 rounded-xl bg-yellow-400/15 border border-yellow-400/40 text-yellow-200 text-lg font-bold text-center"
          >
            {finishNotice}
          </m.div>
        )}
      </AnimatePresence>

      {room.leaderboard.length > 0 && (
        <div className="relative z-10 w-full max-w-lg">
          <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-4">
            <button onClick={toggleLb} aria-expanded={lbOpen} className={`w-full flex items-center gap-2 text-sm font-semibold text-zinc-200 hover:text-white ${lbOpen ? 'mb-3' : ''}`}>
              <Trophy className="w-4 h-4 text-yellow-400" /> อันดับในห้องนี้
              <span className="text-[10px] text-zinc-500 font-normal">({room.leaderboard.length} คน)</span>
              <m.span animate={{ rotate: lbOpen ? 180 : 0 }} className="ml-auto inline-flex"><ChevronDown className="w-4 h-4 text-zinc-500" /></m.span>
            </button>
            <AnimatePresence initial={false}>
            {lbOpen && (
            <m.ol key="lb" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden">
              {room.leaderboard.slice(0, 6).map((e, i) => (
                <li key={e.nickname} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/5">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-4">#{i + 1}</span>
                    <Avatar nickname={e.nickname} avatar={e.avatar} size="sm" />
                    <span className="text-sm">{e.nickname}</span>
                  </span>
                  <span className="text-xs text-zinc-400">
                    <span className="text-yellow-400 font-bold">{e.wins}</span> ชนะ ·{' '}
                    <span className="text-red-400 font-bold">{e.losses}</span> แพ้ · {e.gamesPlayed} เกม
                  </span>
                </li>
              ))}
            </m.ol>
            )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {room.status === 'WAITING' && (
        <div className="text-center space-y-4 relative z-10">
          <p className="text-xl text-zinc-300">กำลังรอผู้เล่น ({players.length} คน)</p>
          <div className="flex gap-4 flex-wrap justify-center">
            {players.map((p, i) => (
              <m.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 px-6 py-3 rounded-xl bg-zinc-900/70 border border-white/10 font-bold"
              >
                <Avatar nickname={p.nickname} avatar={p.avatar} size="sm" />
                {p.nickname}
              </m.div>
            ))}
          </div>
        </div>
      )}

      {room.status === 'PLAYING' && game && (
        <div className="w-full max-w-4xl space-y-4 sm:space-y-8 relative z-10 px-1">
          <div className="flex items-center justify-center gap-3 sm:gap-8 flex-wrap">
            <div className="text-center space-y-2">
              <p className="text-sm text-zinc-400">กองจั่ว</p>
              <div className="relative inline-block">
                    <PlayingCard card={game.topCard} faceDown size="lg" />
                    <m.span
                      key={game.drawPileCount}
                      initial={{ scale: 1.5 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <span className={`min-w-[2.6em] px-2 py-1 rounded-xl font-black tabular-nums text-center bg-black/75 border-2 shadow-lg text-3xl sm:text-4xl ${game.drawPileCount === 0 ? 'border-red-400 text-red-300' : game.drawPileCount <= 10 ? 'border-orange-400 text-orange-200' : 'border-white/70 text-white'}`}>
                        {game.drawPileCount}
                      </span>
                    </m.span>
                  </div>
              <p className="text-xs text-zinc-300 font-semibold">{game.drawPileCount === 0 ? 'หมดกอง — ขโมยไพ่' : `เหลือ ${game.drawPileCount} ใบ`}</p>
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-zinc-400">ไพ่กลาง</p>
              <AnimatePresence mode="popLayout">
                <m.div
                  key={game.topCard.id}
                  initial={{ opacity: 0, scale: 0.4, rotate: -30, y: -30 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <PlayingCard card={game.topCard} size="lg" />
                </m.div>
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

          <m.div
            key={game.gameStatus === 'CHOOSING_DIRECTION' ? 'choosing' : game.currentPlayerId}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            {game.gameStatus === 'CHOOSING_DIRECTION' ? (
              <span className="text-2xl font-bold">{players.find((p) => p.id === game.firstPlayerId)?.nickname ?? ''} กำลังเลือกทิศทาง...</span>
            ) : (
              <span className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500/90 via-teal-400/90 to-emerald-500/90 border-2 border-white/60 shadow-[0_10px_40px_-8px_rgba(16,185,129,0.8)]">
                <span className="text-lg font-bold text-white/90">🎯 ตาของ</span>
                <span className="fx-pulse inline-block text-3xl sm:text-5xl font-black text-white drop-shadow">
                  {nameOf(game.currentPlayerId)}
                </span>
              </span>
            )}
            {game.pendingDraw && (
              <p className="mt-2 text-lg font-bold text-orange-300">
                💥 คอมโบ +{game.pendingDraw.count} รอ {nameOf(game.pendingDraw.targetId)} ตอบโต้ / สะท้อน 🪞 / โล่ 🛡️ / จั่วรับ
              </p>
            )}
          </m.div>

          <div className="relative pt-4">
          <DirectionFlipFlash direction={game.direction} />
          <SeatRow currentId={game.currentPlayerId} className="items-center gap-x-2 gap-y-6 px-2 pt-3">
            {seated.map((p, seatNo) => {
              const isCurrent = p.id === game.currentPlayerId;
              const finishRank = game.finishedOrder.indexOf(p.id);
              const hasFinished = finishRank >= 0;
              const activeN = game.seatOrder.length;
              const isActive = seatNo < activeN;
              const dir = game.direction;
              return (
                <Fragment key={p.id}>
                <m.div
                  data-seat={p.id}
                  layout
                  className={`relative shrink-0 w-32 sm:w-36 rounded-2xl p-4 text-center border-2 ${
                    hasFinished
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : isCurrent ? 'border-emerald-400 bg-emerald-400/10 fx-turn-ring' : p.id === nextId ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  {p.id === nextId && !isCurrent && <NextBadge size="lg" />}
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
                    {hasFinished ? `ชนะอันดับที่ ${finishRank + 1}` : `${game.cardCounts?.[p.id] ?? p.cardCount} ใบ`}
                  </p>
                  {!p.connected && <p className="text-xs text-red-400">หลุดการเชื่อมต่อ</p>}
                </m.div>
                {isActive && seatNo < activeN - 1 && <SeatArrow direction={dir} size="lg" />}
                </Fragment>
              );
            })}
          </SeatRow>
          </div>

          <PlayHistory game={game} nameOf={nameOf} limit={16} />
        </div>
      )}

      {result && room.status !== 'PLAYING' && (
        <m.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4 relative z-10"
        >
          <div className="flex justify-center">
            <Trophy className="fx-trophy w-20 h-20 text-yellow-400 drop-shadow-lg" />
          </div>
          <h2 className="text-4xl font-black text-yellow-400">
            {result.ranking.find((r) => r.playerId === result.winnerId)?.nickname} ชนะ!
          </h2>
          <p className="text-zinc-400">ใช้ {result.turns} ตา · {Math.round(result.durationMs / 1000)} วินาที</p>
        </m.div>
      )}
    </main>
  );
}