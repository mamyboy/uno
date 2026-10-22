'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Crown, Eraser, Loader2, LogOut, RotateCcw, Trash2, Trophy, Tv, Users, WifiOff } from 'lucide-react';
import { socket } from '@/lib/socket';
import { getSession, setSession, removeSession } from '@/lib/session';
import { getProfile, saveProfile } from '@/lib/profile';
import { fileToAvatarDataUrl } from '@/lib/avatar';
import { useGameStore } from '@/store/useGameStore';
import { EV, MIN_PLAYERS, type Card, type Player } from '@cma/shared';
import { PlayingCard } from '@/components/game/PlayingCard';
import { Confetti } from '@/components/game/Confetti';
import { ActionEffect } from '@/components/game/ActionEffect';
import { Soundboard } from '@/components/game/Soundboard';
import { GameFx } from '@/components/game/GameFx';
import { PlayHistory } from '@/components/game/PlayHistory';
import { TurnBanner } from '@/components/game/TurnBanner';
import { Button, LinkButton } from '@/components/ui/Button';

const COLOR_LABEL: Record<string, string> = { RED: 'แดง', YELLOW: 'เหลือง', GREEN: 'เขียว', BLUE: 'น้ำเงิน' };
const COLOR_SWATCH: Record<string, string> = {
  RED: 'bg-red-500', YELLOW: 'bg-yellow-400', GREEN: 'bg-emerald-500', BLUE: 'bg-blue-500',
};

function Avatar({ nickname, avatar, size = 'md' }: { nickname: string; avatar?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-11 h-11 text-xs';
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={nickname} className={`${dims} rounded-full object-cover border-2 border-zinc-700`} />;
  }
  return (
    <span className={`${dims} rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center font-bold`}>
      {nickname.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase();
  const router = useRouter();

  const { session, room, game, hand, result, setSession: storeSetSession, setRoom, setGame, setHand, setResult, reset } =
    useGameStore();

  const [joining, setJoining] = useState(true);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingWildCardIds, setPendingWildCardIds] = useState<string[] | null>(null);
  const [effectCard, setEffectCard] = useState<Card | null>(null);
  const [stealNotice, setStealNotice] = useState('');
  const [stolenCardId, setStolenCardId] = useState<string | null>(null);
  const [finishNotice, setFinishNotice] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const lastTopCardId = useRef<string | null>(null);
  const lastFinishedCount = useRef(0);

  // Remembered nickname from a previous visit on this device — still fully editable below.
  useEffect(() => {
    const saved = getProfile();
    if (saved?.nickname) setNickname(saved.nickname);
  }, []);

  /** If this player has no avatar yet but we remember one from a previous room on this device,
   *  re-apply it automatically so returning players don't have to re-upload every time. */
  function applyRememberedAvatarIfNeeded(snapshot: any, playerId: string) {
    const saved = getProfile();
    if (!saved?.avatar) return;
    const me = snapshot.room?.players?.find((p: Player) => p.id === playerId);
    if (me && !me.avatar) {
      socket.emit(EV.ROOM_SET_AVATAR, { avatar: saved.avatar }, () => {});
    }
  }

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

  useEffect(() => {
    const existing = getSession();

    function applySnapshot(snapshot: any) {
      storeSetSession({ code: snapshot.room.code, sessionToken: existing?.sessionToken ?? '', playerId: snapshot.me?.playerId ?? '' });
      setRoom(snapshot.room);
      setGame(snapshot.game);
      setHand(snapshot.hand);
      setResult(snapshot.result);
    }

    if (existing && existing.code === code) {
      socket.emit(EV.ROOM_JOIN, { code, nickname: '__rejoin__', sessionToken: existing.sessionToken }, (ack: any) => {
        if (ack.ok) {
          setSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
          applySnapshot(ack.snapshot);
          applyRememberedAvatarIfNeeded(ack.snapshot, ack.playerId);
          setJoining(false);
        } else {
          removeSession();
          setJoining(false);
        }
      });
    } else {
      setJoining(false);
    }

    function onRoomUpdate(r: any) {
      setRoom(r);
    }
    function onGameState(g: any) {
      setGame(g);
    }
    function onHand(h: any) {
      setHand(h);
      setSelectedIds([]);
    }
    function onGameOver(res: any) {
      setResult(res);
    }
    function onKicked() {
      removeSession();
      reset();
      router.push('/join');
    }
    function onReplaced() {
      // Same name joined from another tab/device — that one now owns this seat.
      removeSession();
      reset();
      router.push('/join');
    }

    socket.on(EV.ROOM_STATE_UPDATED, onRoomUpdate);
    socket.on(EV.ROOM_PLAYER_JOINED, onRoomUpdate);
    socket.on(EV.ROOM_PLAYER_LEFT, onRoomUpdate);
    socket.on(EV.GAME_STATE, onGameState);
    socket.on(EV.GAME_HAND_UPDATED, onHand);
    socket.on(EV.GAME_GAME_OVER, onGameOver);
    socket.on(EV.ROOM_KICKED, onKicked);
    socket.on(EV.SESSION_REPLACED, onReplaced);

    return () => {
      socket.off(EV.ROOM_STATE_UPDATED, onRoomUpdate);
      socket.off(EV.ROOM_PLAYER_JOINED, onRoomUpdate);
      socket.off(EV.ROOM_PLAYER_LEFT, onRoomUpdate);
      socket.off(EV.GAME_STATE, onGameState);
      socket.off(EV.GAME_HAND_UPDATED, onHand);
      socket.off(EV.GAME_GAME_OVER, onGameOver);
      socket.off(EV.ROOM_KICKED, onKicked);
      socket.off(EV.SESSION_REPLACED, onReplaced);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    socket.emit(EV.ROOM_JOIN, { code, nickname }, (ack: any) => {
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      saveProfile({ nickname });
      setSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
      storeSetSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
      setRoom(ack.snapshot.room);
      setGame(ack.snapshot.game);
      setHand(ack.snapshot.hand);
      setResult(ack.snapshot.result);
      applyRememberedAvatarIfNeeded(ack.snapshot, ack.playerId);
    });
  };

  // Clear a stale "last match" result banner the instant a new round actually starts — static
  // rooms flip straight back to WAITING after a finish, so the banner would otherwise linger
  // into the next game's lobby/play screen.
  useEffect(() => {
    if (room?.status === 'PLAYING') setResult(null);
  }, [room?.status, setResult]);

  if (joining) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-casino-table via-casino-felt to-black text-white">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-casino-table via-casino-felt to-black">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleManualJoin}
          className="w-full max-w-sm p-8 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4 shadow-2xl"
        >
          <h1 className="text-xl font-bold text-white">เข้าร่วมห้อง {code}</h1>
          {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="ชื่อเล่นของคุณ"
            className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            maxLength={16}
            required
          />
          <button type="submit" className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition active:scale-95">
            เข้าร่วม
          </button>
        </motion.form>
      </main>
    );
  }

  const me = room.players.find((p: Player) => p.id === session?.playerId);
  const isHost = me?.isHost ?? false;

  const leaveRoom = () => {
    socket.emit(EV.ROOM_LEAVE, {}, () => {
      removeSession();
      reset();
      router.push('/');
    });
  };

  const clearSession = () => {
    if (!window.confirm('เคลียร์ Session จะล้างข้อมูลผู้เล่นในเบราว์เซอร์นี้ (ไม่แจ้งเซิร์ฟเวอร์) แล้วพาไปหน้าแรก ต้องการดำเนินการต่อหรือไม่?')) return;
    removeSession();
    reset();
    router.push('/');
  };

  const startGame = () => socket.emit(EV.GAME_START, {}, (ack: any) => !ack.ok && setActionError(ack.error));
  const restartGame = () => socket.emit(EV.GAME_RESTART, {}, (ack: any) => !ack.ok && setActionError(ack.error));

  const clearRoom = () => {
    if (!window.confirm('Clear ห้องนี้จะเตะผู้เล่นทุกคนออก (กลับไปหน้าเข้าร่วมห้อง) ให้ห้องว่าง — Leaderboard ยังอยู่ ยืนยันหรือไม่?')) return;
    socket.emit(EV.ROOM_CLEAR, {}, (ack: any) => !ack.ok && setActionError(ack.error));
  };

  const clearLeaderboard = () => {
    if (!window.confirm('ล้าง Leaderboard ของห้องนี้ทั้งหมด ยืนยันหรือไม่?')) return;
    socket.emit(EV.ROOM_CLEAR_LEADERBOARD, { code: room.code }, (ack: any) => !ack.ok && setActionError(ack.error));
  };

  const selectDirection = (direction: 'LEFT' | 'RIGHT') => {
    if (!game) return;
    socket.emit(EV.GAME_SELECT_DIRECTION, { direction, turnNumber: game.turnNumber }, (ack: any) => !ack.ok && setActionError(ack.error));
  };

  const playCard = (cardId: string, chosenColor?: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE') => {
    if (!game) return;
    socket.emit(EV.GAME_PLAY_CARD, { cardId, turnNumber: game.turnNumber, chosenColor }, (ack: any) => !ack.ok && setActionError(ack.error));
    setPendingWildCardIds(null);
  };

  const playCards = (cardIds: string[], chosenColor?: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE') => {
    if (!game || !hand) return;
    if (cardIds.length === 1) {
      const card = hand.hand.find((c) => c.id === cardIds[0]);
      if (card && card.color === null && card.kind !== 'REFLECT') {
        // Wild / Wild Draw Four / Wild Draw Two — ask the player to pick a color before sending.
        setPendingWildCardIds(cardIds);
        return;
      }
      playCard(cardIds[0]);
      return;
    }
    // A multi-card draw-family stack (DRAW_TWO / WILD_DRAW_TWO / WILD_DRAW_FOUR, any mix) needs
    // one color choice if any wild card is in it, applied to the whole stack at once.
    if (!chosenColor && cardIds.some((id) => hand.hand.find((c) => c.id === id)?.color === null)) {
      setPendingWildCardIds(cardIds);
      return;
    }
    socket.emit(EV.GAME_PLAY_CARDS, { cardIds, turnNumber: game.turnNumber, chosenColor }, (ack: any) => {
      if (!ack.ok) setActionError(ack.error);
    });
    setSelectedIds([]);
    setPendingWildCardIds(null);
  };

  const chooseWildColor = (color: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE') => {
    if (!pendingWildCardIds) return;
    if (pendingWildCardIds.length === 1) {
      playCard(pendingWildCardIds[0], color);
    } else {
      playCards(pendingWildCardIds, color);
    }
    setSelectedIds([]);
  };

  const toggleSelect = (cardId: string, card: { kind: string; value?: number; color?: string | null }) => {
    setSelectedIds((prev) => {
      if (prev.includes(cardId)) return [];
      if (prev.length === 0) return [cardId];
      const firstCard = hand?.hand.find((c) => c.id === prev[0]);
      if (!firstCard) return prev;
      if (firstCard.kind === 'REFLECT' || card.kind === 'REFLECT') return [cardId]; // Reflect always plays alone
      const DRAW_FAMILY = new Set(['DRAW_TWO', 'WILD_DRAW_TWO', 'WILD_DRAW_FOUR', 'WILD_DRAW_EIGHT']);
      // NUMBER cards stack only by matching value; SKIP/REVERSE stack regardless of color;
      // DRAW_TWO / WILD_DRAW_TWO / WILD_DRAW_FOUR / WILD_DRAW_EIGHT stack with EACH OTHER in any
      // mix (amounts add up) — the FIRST card selected is already guaranteed legal (it only
      // appears in hand.playableCardIds if it is), so any additional draw-family card can be
      // added freely regardless of its own color, same as the server's "at least one must
      // legally counter/open" rule.
      if (DRAW_FAMILY.has(firstCard.kind)) {
        if (!DRAW_FAMILY.has(card.kind)) return prev;
      } else if (firstCard.kind !== card.kind) {
        return prev;
      } else if (firstCard.kind === 'NUMBER') {
        if (firstCard.value !== card.value) return prev;
      } else if (firstCard.kind !== 'SKIP' && firstCard.kind !== 'REVERSE') {
        return prev; // WILD can never be stacked (it's not in the draw family and isn't NUMBER/SKIP/REVERSE)
      }
      return [...prev, cardId];
    });
  };

  const drawCard = (drawInsteadOfWild = false) => {
    if (!game) return;
    socket.emit(EV.GAME_DRAW_CARD, { turnNumber: game.turnNumber, drawInsteadOfWild }, (ack: any) => {
      if (!ack.ok) {
        setActionError(ack.error);
        return;
      }
      if (ack.stolen && ack.card) {
        setStealNotice('ขโมยไพ่จากคู่ต่อสู้! 🤏');
        setTimeout(() => setStealNotice(''), 2500);
        // Trigger a brief highlight animation on the stolen card
        setStolenCardId(ack.card.id);
        setTimeout(() => setStolenCardId(null), 3000);
      } else if (ack.stolen) {
        setStealNotice('กองไพ่หมดแล้ว! ดึงไพ่จากคู่ต่อสู้มา 🤏');
        setTimeout(() => setStealNotice(''), 2500);
      }
    });
  };

  const players = room.players.filter((p: Player) => p.isPlayer);
  const nameOf = (id: string | null | undefined) => room.players.find((p: Player) => p.id === id)?.nickname ?? 'ผู้เล่น';
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join` : '';
  const meAvatar = room.players.find((p: Player) => p.id === session?.playerId)?.avatar;

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      socket.emit(EV.ROOM_SET_AVATAR, { avatar: dataUrl }, (ack: any) => {
        setAvatarUploading(false);
        if (!ack.ok) {
          setActionError(ack.error);
          return;
        }
        saveProfile({ avatar: dataUrl }); // remembered for next time, still replaceable any time
      });
    } catch {
      setAvatarUploading(false);
      setActionError('ไม่สามารถอัปโหลดรูปโปรไฟล์ได้');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-casino-table via-casino-felt to-black text-white p-4 md:p-8 relative overflow-hidden">
      {room.status === 'FINISHED' && result && result.winnerId && <Confetti />}
      <ActionEffect card={effectCard} />
      <GameFx game={game} result={result} nameOf={nameOf} />
      <Soundboard />

      <div className="max-w-3xl mx-auto space-y-6 relative z-10">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="relative group shrink-0"
              title="อัปโหลดรูปโปรไฟล์"
            >
              <Avatar nickname={me?.nickname ?? '?'} avatar={meAvatar} size="lg" />
              <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center border-3 border-zinc-900 group-hover:bg-emerald-400 shadow-lg">
                {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
            {!meAvatar && (
              <span className="hidden sm:inline text-xs text-zinc-400 bg-zinc-800/60 px-2 py-1 rounded backdrop-blur border border-zinc-700/50">
                กดรูปเพื่ออัปโหลดโปรไฟล์
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{room.name}</h1>
              <p className="text-zinc-400 text-sm">
                รหัสห้อง: <span className="font-mono text-emerald-400 tracking-widest">{room.code}</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <LinkButton href={`/room/${code}/board`} target="_blank" rel="noreferrer" variant="ghost" size="md" className="justify-self-stretch">
              <Tv className="w-4 h-4" /> <span className="hidden xs:inline">เปิด</span>กระดานกลาง
            </LinkButton>
            {isHost && (
              <Button onClick={clearRoom} variant="ghost" size="md">
                <Trash2 className="w-4 h-4" /> Clear ห้อง
              </Button>
            )}
            <Button onClick={clearSession} variant="ghost" size="md">
              <Eraser className="w-4 h-4" /> เคลียร์ Session
            </Button>
            <Button onClick={leaveRoom} variant="danger" size="md">
              <LogOut className="w-4 h-4" /> ออกจากห้อง
            </Button>
          </div>
        </header>

        {room.leaderboard.length > 0 && (
          <section className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="flex items-center gap-2 text-zinc-300 text-sm font-semibold">
                <Trophy className="w-4 h-4 text-yellow-400" /> อันดับในห้องนี้ <span className="text-[10px] text-zinc-500 font-normal">(นับตามชื่อ)</span>
              </p>
              {(isHost || room.isStatic) && (
                <button onClick={clearLeaderboard} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-300 hover:border-red-500/50">
                  <Trash2 className="w-3 h-3" /> ล้าง Leaderboard
                </button>
              )}
            </div>
            <ol className="space-y-1.5">
              {room.leaderboard.slice(0, 8).map((e, i) => (
                <li key={e.nickname} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-800/50">
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
          </section>
        )}

        <AnimatePresence>
          {actionError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm overflow-hidden"
              onAnimationComplete={() => setTimeout(() => setActionError(''), 2500)}
            >
              {actionError}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {stealNotice && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-200 text-sm overflow-hidden font-semibold text-center"
            >
              {stealNotice}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {finishNotice && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="p-4 rounded-xl bg-yellow-400/15 border border-yellow-400/40 text-yellow-200 text-base overflow-hidden font-bold text-center"
            >
              {finishNotice}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Winner screen (last match's result) — shown alongside the lobby for static rooms,
            which flip back to WAITING immediately so a new round can start right away. */}
        {result && room.status !== 'PLAYING' && (
          <motion.section
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 space-y-4 text-center shadow-2xl"
          >
            <motion.div
              animate={{ y: [0, -14, 0], rotate: [0, -8, 8, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
              className="flex justify-center"
            >
              <Trophy className="w-14 h-14 text-yellow-400 drop-shadow-lg" />
            </motion.div>
            <h2 className="text-2xl font-bold text-yellow-400">
              {result.ranking.find((r) => r.playerId === result.winnerId)?.nickname ?? 'ไม่มีผู้ชนะ'} ชนะ!
            </h2>
            <p className="text-sm text-zinc-400">
              เหตุผล: {result.reason} · จำนวนตา {result.turns} · เวลาที่ใช้ {Math.round(result.durationMs / 1000)} วินาที
            </p>
            <ol className="text-left space-y-1 max-w-xs mx-auto">
              {result.ranking.map((r, i) => (
                <motion.li
                  key={r.playerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex justify-between px-4 py-2 rounded-xl bg-zinc-800/60"
                >
                  <span>#{r.rank} {r.nickname}</span>
                  <span className="text-zinc-400">{r.cardsLeft} ใบเหลือ</span>
                </motion.li>
              ))}
            </ol>
            {isHost && room.status === 'FINISHED' && (
              <Button onClick={restartGame} variant="gold" size="md" className="mx-auto">
                <RotateCcw className="w-4 h-4" /> เริ่มรอบใหม่
              </Button>
            )}
            {room.status === 'WAITING' && (
              <p className="text-xs text-zinc-500">ห้องพร้อมแล้ว — เริ่มรอบใหม่ได้จากปุ่มด้านล่าง</p>
            )}
          </motion.section>
        )}

        {/* Lobby / Waiting */}
        {room.status === 'WAITING' && (
          <section className="rounded-2xl bg-zinc-900/80 backdrop-blur border border-zinc-800 p-4 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-zinc-300">
              <Users className="w-5 h-5" /> ผู้เล่นในห้อง ({players.length}/{room.maxPlayers})
            </div>
            <ul className="space-y-2">
              {room.players.map((p: Player, i: number) => (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between px-4 py-2 rounded-xl bg-zinc-800/60"
                >
                  <span className="flex items-center gap-2">
                    <Avatar nickname={p.nickname} avatar={p.avatar} size="sm" />
                    {p.isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                    {p.nickname}
                    {!p.isPlayer && <span className="text-xs text-zinc-500">(ผู้ควบคุม)</span>}
                  </span>
                  <span className={p.connected ? 'text-emerald-400 text-xs flex items-center gap-1' : 'text-red-400 text-xs flex items-center gap-1'}>
                    {p.connected ? 'ออนไลน์' : (<><WifiOff className="w-3 h-3" /> หลุดการเชื่อมต่อ</>)}
                  </span>
                </motion.li>
              ))}
            </ul>
            {joinUrl && (
              <p className="text-xs text-zinc-500">
                ชวนเพื่อนที่ {joinUrl} ด้วยรหัส <span className="font-mono text-emerald-400">{room.code}</span>
              </p>
            )}
            {isHost && (
              <Button onClick={startGame} variant="primary" size="lg" fullWidth disabled={players.length < MIN_PLAYERS}>
                {players.length < MIN_PLAYERS ? `ต้องมีผู้เล่นอย่างน้อย ${MIN_PLAYERS} คน` : 'เริ่มเกม'}
              </Button>
            )}
          </section>
        )}

        {/* In game */}
        {room.status === 'PLAYING' && game && (
          <section className="space-y-4">
            {game.gameStatus === 'PLAYING' && (
              <TurnBanner
                isMyTurn={!!hand?.isMyTurn}
                myName={me?.nickname ?? ''}
                currentName={nameOf(game.currentPlayerId)}
                mustCounter={game.pendingDraw?.targetId === session?.playerId}
                comboCount={game.pendingDraw?.count}
              />
            )}
            {/* casino table */}
            <div
              className="rounded-3xl border-4 border-casino-border p-3 sm:p-6 space-y-3 sm:space-y-4 text-center shadow-2xl relative overflow-hidden"
              style={{
                background:
                  'radial-gradient(ellipse at center, #1a4530 0%, #0f2b1d 60%, #081710 100%)',
              }}
            >
              <div className="flex items-center justify-center gap-2 sm:gap-6 flex-wrap">
                <div className="text-center space-y-1">
                  <p className="text-xs text-zinc-400">กองจั่ว</p>
                  <PlayingCard card={game.topCard} faceDown size="md" />
                  <p className="text-xs text-zinc-500">{game.drawPileCount} ใบ</p>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs text-zinc-400">ไพ่กลาง</p>
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={game.topCard.id}
                      initial={{ opacity: 0, scale: 0.4, rotate: -25, y: -20 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 15 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <PlayingCard card={game.topCard} size="lg" />
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs text-zinc-400">ทิศทาง</p>
                  <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-lg sm:text-2xl ${game.direction ? 'animate-spin-slow' : ''}`}>
                    {game.direction === 'RIGHT' ? '⟳' : game.direction === 'LEFT' ? '⟲' : '?'}
                  </div>
                </div>
              </div>

              <p className="text-sm text-zinc-400">ตาที่ {game.turnNumber}</p>

              {game.topCard.color && (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="text-zinc-400">สีที่ต้องเล่น:</span>
                  <span className={`w-4 h-4 rounded-full ${COLOR_SWATCH[game.topCard.color]} ring-2 ring-white/30`} />
                  <span className="font-bold">{COLOR_LABEL[game.topCard.color]}</span>
                  {(game.topCard.kind === 'WILD' || game.topCard.kind === 'WILD_DRAW_TWO' || game.topCard.kind === 'WILD_DRAW_FOUR' || game.topCard.kind === 'WILD_DRAW_EIGHT') && (
                    <span className="text-xs text-purple-300">(เลือกจากไพ่เปลี่ยนสี)</span>
                  )}
                </div>
              )}

              {/* player ring */}
              <div className="flex flex-wrap gap-3 justify-center pt-2">
                {players.map((p: Player) => {
                  const isCurrent = p.id === game.currentPlayerId;
                  const finishRank = game.finishedOrder.indexOf(p.id);
                  const hasFinished = finishRank >= 0;
                  return (
                    <div key={p.id} className="flex flex-col items-center gap-1">
                      <motion.div
                        className={`relative rounded-full border-2 ${
                          hasFinished ? 'border-yellow-400' : isCurrent ? 'border-emerald-300 animate-turn-ring' : 'border-zinc-600'
                        } ${p.avatar ? '' : isCurrent ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                        animate={isCurrent && !hasFinished ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 1.2, repeat: isCurrent && !hasFinished ? Infinity : 0 }}
                      >
                        <Avatar nickname={p.nickname} avatar={p.avatar} size="md" />
                        {hasFinished && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-bold flex items-center justify-center ring-2 ring-zinc-900">
                            {finishRank + 1}
                          </span>
                        )}
                      </motion.div>
                      <span className="text-[11px] text-zinc-300">{p.nickname}</span>
                      <span className="text-[10px] text-zinc-500">
                        {hasFinished ? `ชนะอันดับที่ ${finishRank + 1}` : `${p.cardCount} ใบ`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {game.gameStatus === 'CHOOSING_DIRECTION' && hand?.isMyTurn && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 text-center space-y-4"
              >
                <p className="font-bold">เลือกทิศทางการเล่น</p>
                <div className="flex gap-4 justify-center">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectDirection('LEFT')}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-300/50 font-bold text-lg text-white shadow-[0_3px_0_0_rgba(4,65,45,0.75),0_8px_20px_-6px_rgba(16,185,129,0.55)] active:translate-y-[2px] active:shadow-none transition-[transform,filter]"
                  >
                    ⟲ ซ้าย (LEFT)
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectDirection('RIGHT')}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-b from-sky-400 to-blue-600 hover:from-sky-400 hover:to-blue-500 border border-sky-300/50 font-bold text-lg text-white shadow-[0_3px_0_0_rgba(10,45,90,0.75),0_8px_20px_-6px_rgba(59,130,246,0.55)] active:translate-y-[2px] active:shadow-none transition-[transform,filter]"
                  >
                    ⟳ ขวา (RIGHT)
                  </motion.button>
                </div>
              </motion.div>
            )}

            {game.pendingDraw && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-orange-500/15 border border-orange-400/30 p-4 text-center font-bold text-orange-200"
              >
                {game.pendingDraw.targetId === session?.playerId
                  ? `ถึงตาคุณตอบโต้! เล่น +2/+4/+8 ต่อ, ใช้ไพ่สะท้อน 🪞 หรือจั่วสะสม ${game.pendingDraw.count} ใบ`
                  : `${players.find((p) => p.id === game.pendingDraw?.targetId)?.nickname ?? ''} ต้องตอบโต้ด้วย +2/+4/+8, สะท้อน 🪞 หรือจั่ว ${game.pendingDraw.count} ใบ`}
              </motion.div>
            )}

            {hand && !game?.finishedOrder?.includes(session?.playerId ?? '') && !game?.winnerId && (
              <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 sm:p-6 space-y-4">
                <p className="text-sm text-zinc-400">
                  ไพ่ในมือของคุณ ({hand.hand.length} ใบ)
                  {selectedIds.length > 1 && (
                    <span className="text-emerald-400"> · เลือกไว้ {selectedIds.length} ใบ (ใบสุดท้ายที่เลือกจะกำหนดสี/เลขให้คนต่อไป)</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <AnimatePresence>
                    {hand.hand
                      .slice()
                      .sort((a, b) => {
                        const kindOrder: Record<string, number> = { NUMBER: 0, SKIP: 1, REVERSE: 2, DRAW_TWO: 3, WILD: 4, WILD_DRAW_TWO: 5, WILD_DRAW_FOUR: 6, WILD_DRAW_EIGHT: 7, REFLECT: 8 };
                        const ka = kindOrder[a.kind] ?? 99;
                        const kb = kindOrder[b.kind] ?? 99;
                        if (ka !== kb) return ka - kb;
                        if (a.kind === 'NUMBER' && b.kind === 'NUMBER') return (a.value ?? 0) - (b.value ?? 0);
                        if (a.color && b.color) return a.color.localeCompare(b.color);
                        return 0;
                      })
                      .map((c) => {
                      const selectedIndex = selectedIds.indexOf(c.id);
                      const isSelected = selectedIndex >= 0;
                      const firstSelected = selectedIds.length > 0 ? hand.hand.find((h) => h.id === selectedIds[0]) : undefined;
                      const canStack =
                        selectedIds.length > 0 &&
                        !!firstSelected &&
                        firstSelected.kind === c.kind &&
                        (firstSelected.kind === 'NUMBER'
                          ? firstSelected.value === c.value
                          : firstSelected.kind === 'SKIP' || firstSelected.kind === 'REVERSE');
                      const DRAW_FAM = ['DRAW_TWO', 'WILD_DRAW_TWO', 'WILD_DRAW_FOUR', 'WILD_DRAW_EIGHT'];
                      const canStackDraw = !!firstSelected && DRAW_FAM.includes(firstSelected.kind) && DRAW_FAM.includes(c.kind);
                      const clickable = hand.isMyTurn && (hand.playableCardIds.includes(c.id) || canStack || canStackDraw);
                      return (
                        <motion.div key={c.id} layout className="relative" exit={{ opacity: 0, y: 30, scale: 0.6 }}>
                          <PlayingCard
                            card={c}
                            playable={clickable}
                            selected={isSelected}
                            onClick={clickable ? () => toggleSelect(c.id, c) : undefined}
                          />
                          {isSelected && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold flex items-center justify-center ring-2 ring-zinc-900"
                            >
                              {selectedIndex + 1}
                            </motion.span>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
                {selectedIds.length > 0 && (
                  <Button onClick={() => playCards(selectedIds)} variant="primary" size="lg" fullWidth>
                    เล่น {selectedIds.length} ใบ
                  </Button>
                )}
                {hand.isMyTurn && hand.canDraw && !hand.canDrawInsteadOfWild && (
                  <Button onClick={() => drawCard(false)} variant="gold" size="lg" fullWidth>
                    {game.pendingDraw?.targetId === session?.playerId
                      ? `จั่วสะสม ${game.pendingDraw?.count} ใบ`
                      : 'จั่วไพ่ (Draw Card)'}
                  </Button>
                )}
                {hand.isMyTurn && hand.canDrawInsteadOfWild && (
                  <Button onClick={() => drawCard(true)} variant="ghost" size="lg" fullWidth>
                    จั่วแทนการเล่น Wild Draw
                  </Button>
                )}
                {hand.isMyTurn && !hand.canDraw && hand.playableCardIds.length === 0 && (
                  <p className="text-center text-sm text-zinc-500">ไม่มีไพ่ให้จั่วแล้ว — ระบบจะข้ามตานี้อัตโนมัติ</p>
                )}
              </div>
            )}

            <PlayHistory game={game} nameOf={nameOf} compact />
          </section>
        )}

      </div>

      {/* Wild color picker modal */}
      <AnimatePresence>
        {pendingWildCardIds && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
            onClick={() => setPendingWildCardIds(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-6 space-y-4 text-center shadow-2xl"
            >
              <p className="font-bold text-lg">เลือกสีให้ไพ่ Wild</p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { color: 'RED' as const, label: 'แดง', cls: 'from-red-500 to-red-700' },
                    { color: 'YELLOW' as const, label: 'เหลือง', cls: 'from-yellow-400 to-amber-600' },
                    { color: 'GREEN' as const, label: 'เขียว', cls: 'from-emerald-400 to-emerald-700' },
                    { color: 'BLUE' as const, label: 'น้ำเงิน', cls: 'from-blue-400 to-blue-700' },
                  ]
                ).map((opt) => (
                  <motion.button
                    key={opt.color}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => chooseWildColor(opt.color)}
                    className={`py-6 rounded-xl bg-gradient-to-br ${opt.cls} font-bold text-white shadow-lg`}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}