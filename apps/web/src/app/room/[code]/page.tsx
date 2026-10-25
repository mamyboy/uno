'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { Camera, ChevronDown, Crown, Eraser, Loader2, LogOut, RotateCcw, Trash2, Trophy, Tv, Users, WifiOff } from 'lucide-react';
import { socket } from '@/lib/socket';
import { getSession, setSession, removeSession } from '@/lib/session';
import { getProfile, saveProfile } from '@/lib/profile';
import { fileToAvatarDataUrl, avatarSrc } from '@/lib/avatar';
import { useGameStore } from '@/store/useGameStore';
import { EV, MIN_PLAYERS, type Card, type Player } from '@cma/shared';
import { PlayingCard } from '@/components/game/PlayingCard';
import { Confetti } from '@/components/game/Confetti';
import { ActionEffect } from '@/components/game/ActionEffect';
import { Soundboard } from '@/components/game/Soundboard';
import { GameFx } from '@/components/game/GameFx';
import { PlayHistory } from '@/components/game/PlayHistory';
import { TurnBanner } from '@/components/game/TurnBanner';
import { useCollapse } from '@/components/game/useCollapse';
import { inFrame } from '@/lib/frameBatch';
import { playPop, popPitchFor } from '@/lib/sfx';
import { TauntButton, TauntLayer } from '@/components/game/Taunts';
import { VoiceButton, VoiceLayer } from '@/components/game/Voice';
import { DirectionFlipFlash, NextBadge, SeatArrow, SeatRow } from '@/components/game/SeatArrow';
import { nextSeatIndex } from '@cma/shared';
import { Button, LinkButton } from '@/components/ui/Button';

const COLOR_LABEL: Record<string, string> = { RED: 'แดง', YELLOW: 'เหลือง', GREEN: 'เขียว', BLUE: 'น้ำเงิน' };
const COLOR_SWATCH: Record<string, string> = {
  RED: 'bg-red-500', YELLOW: 'bg-yellow-400', GREEN: 'bg-emerald-500', BLUE: 'bg-blue-500',
};

function Avatar({ nickname, avatar, size = 'md' }: { nickname: string; avatar?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-lg' : 'w-11 h-11 text-xs';
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarSrc(avatar)} alt={nickname} loading="lazy" decoding="async" className={`${dims} rounded-full object-cover border-2 border-zinc-700`} />;
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

  const [lbOpen, toggleLb] = useCollapse('cma:lb-open:player');
  // Stable per-card click handlers so memoized <PlayingCard>s don't re-render on every update.
  const toggleRef = useRef<(id: string, c: any) => void>(() => {});
  const handCardsRef = useRef<any[]>([]);
  const cardHandlers = useRef(new Map<string, () => void>());
  const handlerFor = useCallback((id: string) => {
    let h = cardHandlers.current.get(id);
    if (!h) {
      h = () => {
        const c = handCardsRef.current.find((x) => x.id === id);
        if (c) toggleRef.current(id, c);
      };
      cardHandlers.current.set(id, h);
    }
    return h;
  }, []);

  const [joining, setJoining] = useState(true);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingWildCardIds, setPendingWildCardIds] = useState<string[] | null>(null);
  const [effectCard, setEffectCard] = useState<Card | null>(null);
  // Optimistic play: cards leave the hand and land on the pile immediately; the server's answer
  // either confirms it (next hand update) or we pull them back.
  const [optimistic, setOptimistic] = useState<{ ids: string[]; top: Card | null; at: number } | null>(null);
  const [returningIds, setReturningIds] = useState<string[]>([]);
  const optimisticRef = useRef<{ ids: string[] } | null>(null);
  optimisticRef.current = optimistic;
  const [stealNotice, setStealNotice] = useState('');
  const [stolenCardId, setStolenCardId] = useState<string | null>(null);
  const [finishNotice, setFinishNotice] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const lastTopCardId = useRef<string | null>(null);
  const effectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (effectTimer.current) clearTimeout(effectTimer.current); }, []);
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
    // Same fix as the action banner: a room update must not cancel the hide timer.
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => setFinishNotice(''), 3500);
  }, [game?.finishedOrder?.length, room]);

  // Flash a big banner whenever an Action/Wild card lands on top of the discard pile.
  useEffect(() => {
    const top = optimistic?.top ?? game?.topCard;
    if (!top || top.id === lastTopCardId.current) return;
    lastTopCardId.current = top.id;
    if (top.kind === 'NUMBER') return;
    setEffectCard(top);
    // Timer lives in a ref: it must NOT be cancelled when an unrelated dependency changes
    // (e.g. the optimistic play being confirmed right after) — that left the banner stuck.
    if (effectTimer.current) clearTimeout(effectTimer.current);
    effectTimer.current = setTimeout(() => setEffectCard(null), 1300);
  }, [game?.topCard?.id, optimistic?.top?.id]);

  // Error toast auto-hides 2.8s after the LATEST message (a new error restarts the countdown).
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(''), 2800);
    return () => clearTimeout(t);
  }, [actionError]);

  // Safety net: if no confirmation ever arrives, stop pretending after a few seconds.
  useEffect(() => {
    if (!optimistic) return;
    const t = setTimeout(() => setOptimistic(null), 4000);
    return () => clearTimeout(t);
  }, [optimistic]);

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
          // Kicked on disconnect (or session expired): join again fresh with the remembered name.
          removeSession();
          const name = getProfile()?.nickname;
          if (!name) return setJoining(false);
          socket.emit(EV.ROOM_JOIN, { code, nickname: name }, (ack2: any) => {
            if (ack2.ok) {
              setSession({ code: ack2.code, sessionToken: ack2.sessionToken, playerId: ack2.playerId });
              applySnapshot(ack2.snapshot);
              storeSetSession({ code: ack2.code, sessionToken: ack2.sessionToken, playerId: ack2.playerId });
            } else {
              setError(ack2.error === 'ROOM_IN_GAME' ? 'หลุดการเชื่อมต่อระหว่างเกม — เกมกำลังเล่นอยู่ รอรอบถัดไปแล้วเข้าใหม่ได้เลย' : ack2.error);
            }
            setJoining(false);
          });
        }
      });
    } else {
      setJoining(false);
    }

    // Updates for one move arrive as several messages — apply them together in one frame.
    function onRoomUpdate(r: any) {
      inFrame(() => setRoom(r));
    }
    function onGameState(g: any) {
      inFrame(() => setGame(g));
    }
    function onHand(h: any) {
      inFrame(() => {
        setHand(h);
        setSelectedIds([]);
        setOptimistic(null); // authoritative hand arrived
      });
    }
    function onGameOver(res: any) {
      inFrame(() => setResult(res));
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
    // The server kicks a player the moment their connection drops — so after a live reconnect,
    // re-enter the room fresh (same name) instead of sitting on a dead session.
    let dropped = false;
    const onDisconnect = () => { dropped = true; };
    const onConnect = () => {
      if (!dropped) return;
      dropped = false;
      // Brief drops (phone app-switch) get a grace period server-side — try resuming the exact
      // same session first; only if that's gone (grace expired / real kick) fall back to a fresh
      // join under the remembered nickname.
      const existingToken = getSession();
      const fallback = () => {
        removeSession();
        const name = getProfile()?.nickname;
        if (!name) { reset(); router.push('/join'); return; }
        socket.emit(EV.ROOM_JOIN, { code, nickname: name }, (ack: any) => {
          if (!ack.ok) { reset(); router.push('/join'); return; }
          setSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
          applySnapshot(ack.snapshot);
          storeSetSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
        });
      };
      if (existingToken && existingToken.code === code) {
        socket.emit(EV.ROOM_JOIN, { code, nickname: '__rejoin__', sessionToken: existingToken.sessionToken }, (ack: any) => {
          if (ack.ok) {
            setSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
            applySnapshot(ack.snapshot);
            storeSetSession({ code: ack.code, sessionToken: ack.sessionToken, playerId: ack.playerId });
          } else {
            fallback();
          }
        });
      } else {
        fallback();
      }
    };
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off(EV.ROOM_STATE_UPDATED, onRoomUpdate);
      socket.off(EV.ROOM_PLAYER_JOINED, onRoomUpdate);
      socket.off(EV.ROOM_PLAYER_LEFT, onRoomUpdate);
      socket.off(EV.GAME_STATE, onGameState);
      socket.off(EV.GAME_HAND_UPDATED, onHand);
      socket.off(EV.GAME_GAME_OVER, onGameOver);
      socket.off(EV.ROOM_KICKED, onKicked);
      socket.off(EV.SESSION_REPLACED, onReplaced);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
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
        <m.form
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
        </m.form>
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

  /** Show the play right away; roll back if the server says no. */
  const beginOptimistic = (cardIds: string[], chosenColor?: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE') => {
    const cards = cardIds.map((id) => hand?.hand.find((c) => c.id === id)).filter(Boolean) as Card[];
    const last = cards[cards.length - 1];
    // Reflect / Shield / Shuffle slide UNDER the top card, so the pile's top doesn't change.
    const slidesUnder = !!last && ['REFLECT', 'SHIELD', 'SHUFFLE'].includes(last.kind);
    const top = last && !slidesUnder ? ({ ...last, color: last.color ?? chosenColor ?? null } as Card) : null;
    const o = { ids: cardIds, top, at: Date.now() };
    optimisticRef.current = o;
    setOptimistic(o);
    playPop(popPitchFor(session?.playerId), cardIds.length); // instant feedback on tap
  };
  const rollback = (error: string) => {
    setReturningIds(optimisticRef.current?.ids ?? []);
    optimisticRef.current = null;
    // The pile goes back to the card that was already there — don't re-announce it.
    lastTopCardId.current = game?.topCard?.id ?? null;
    setEffectCard(null);
    setOptimistic(null);
    setTimeout(() => setReturningIds([]), 800);
    setActionError(error);
    try { navigator.vibrate?.([60, 40, 60]); } catch { /* ignore */ }
  };

  const playCard = (cardId: string, chosenColor?: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE') => {
    if (!game || optimistic) return;
    beginOptimistic([cardId], chosenColor);
    socket.emit(EV.GAME_PLAY_CARD, { cardId, turnNumber: game.turnNumber, chosenColor }, (ack: any) => {
      if (!ack.ok) rollback(ack.error);
    });
    setSelectedIds([]);
    setPendingWildCardIds(null);
  };

  const playCards = (cardIds: string[], chosenColor?: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE') => {
    if (!game || !hand) return;
    if (cardIds.length === 1) {
      const card = hand.hand.find((c) => c.id === cardIds[0]);
      if (card && card.color === null && !['REFLECT', 'SHIELD', 'SHUFFLE'].includes(card.kind)) {
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
    if (optimistic) return;
    beginOptimistic(cardIds, chosenColor);
    socket.emit(EV.GAME_PLAY_CARDS, { cardIds, turnNumber: game.turnNumber, chosenColor }, (ack: any) => {
      if (!ack.ok) rollback(ack.error);
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
      if (['REFLECT', 'SHIELD', 'SHUFFLE'].includes(firstCard.kind) || ['REFLECT', 'SHIELD', 'SHUFFLE'].includes(card.kind)) return [cardId]; // special cards always play alone
      const DRAW_FAMILY = new Set(['DRAW_TWO', 'WILD_DRAW_TWO', 'WILD_DRAW_FOUR', 'WILD_DRAW_EIGHT']);
      // NUMBER cards stack only by matching value; SKIP/REVERSE stack regardless of color;
      // DRAW_TWO / WILD_DRAW_TWO / WILD_DRAW_FOUR / WILD_DRAW_EIGHT stack with EACH OTHER in any
      // mix (amounts add up) — the FIRST card selected is already guaranteed legal (it only
      // appears in hand.playableCardIds if it is), so any additional draw-family card can be
      // added freely regardless of its own color, same as the server's "at least one must
      // legally counter/open" rule.
      if (DRAW_FAMILY.has(firstCard.kind)) {
        if (!DRAW_FAMILY.has(card.kind)) return prev;
        // Wild Draws and Draw Twos can never be mixed in one move.
        if ((firstCard.kind === 'DRAW_TWO') !== (card.kind === 'DRAW_TWO')) return prev;
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
  toggleRef.current = toggleSelect;
  handCardsRef.current = hand?.hand ?? [];

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
    <main className="min-h-screen bg-gradient-to-br from-casino-table via-casino-felt to-black text-white p-4 pb-28 md:p-8 md:pb-28 relative overflow-hidden">
      {room.status === 'FINISHED' && result && result.winnerId && <Confetti />}
      <ActionEffect card={effectCard} />
      <GameFx game={game} result={result} nameOf={nameOf} avatarOf={avatarOf} meId={session?.playerId} />
      <TauntLayer />
      <VoiceLayer />
      {/* floating action dock: sounds · taunt · radio settings · push-to-talk (thumb-reachable, right) */}
      <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-[60] flex items-center gap-2 rounded-full bg-zinc-950/85 border border-white/10 p-1.5 pl-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <Soundboard />
        <TauntButton />
        {me && <VoiceButton roomVoiceEnabled={room.voiceEnabled !== false} canToggleRoom={isHost || !!room.isStatic} />}
      </div>

      <div className="max-w-3xl mx-auto space-y-6 relative z-10">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => (room.status === 'PLAYING' ? setActionError('เปลี่ยนรูปโปรไฟล์ได้ตอนอยู่นอกเกมเท่านั้น') : avatarInputRef.current?.click())}
              className={`relative group shrink-0 ${room.status === 'PLAYING' ? 'cursor-not-allowed' : ''}`}
              title={room.status === 'PLAYING' ? 'เปลี่ยนรูปได้หลังจบเกม' : 'อัปโหลดรูปโปรไฟล์'}
            >
              <Avatar nickname={me?.nickname ?? '?'} avatar={meAvatar} size="lg" />
              <span className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-3 border-zinc-900 shadow-lg ${room.status === 'PLAYING' ? 'bg-zinc-700 text-zinc-400' : 'bg-emerald-500 group-hover:bg-emerald-400'}`}>
                {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
            {!meAvatar && (
              <span className="hidden sm:inline text-xs text-zinc-400 bg-zinc-800/90 px-2 py-1 rounded border border-zinc-700/50">
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
            <div className={`flex items-center justify-between ${lbOpen ? 'mb-3' : ''}`}>
              <button onClick={toggleLb} className="flex items-center gap-2 text-zinc-300 text-sm font-semibold hover:text-white" aria-expanded={lbOpen}>
                <Trophy className="w-4 h-4 text-yellow-400" /> อันดับในห้องนี้ <span className="text-[10px] text-zinc-500 font-normal">(นับตามชื่อ · {room.leaderboard.length} คน)</span>
                <m.span animate={{ rotate: lbOpen ? 180 : 0 }} className="inline-flex"><ChevronDown className="w-4 h-4 text-zinc-500" /></m.span>
              </button>
              {lbOpen && (isHost || room.isStatic) && (
                <button onClick={clearLeaderboard} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-300 hover:border-red-500/50">
                  <Trash2 className="w-3 h-3" /> ล้าง Leaderboard
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
            {lbOpen && (
            <m.ol key="lb" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-1.5 overflow-hidden">
              {room.leaderboard.slice(0, 8).map((e, i) => (
                <li key={e.nickname} className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-800/50">
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
          </section>
        )}

        <AnimatePresence>
          {actionError && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm overflow-hidden"
            >
              {actionError}
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {stealNotice && (
            <m.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-xl bg-purple-500/15 border border-purple-400/30 text-purple-200 text-sm overflow-hidden font-semibold text-center"
            >
              {stealNotice}
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {finishNotice && (
            <m.div
              initial={{ opacity: 0, scale: 0.9, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="p-4 rounded-xl bg-yellow-400/15 border border-yellow-400/40 text-yellow-200 text-base overflow-hidden font-bold text-center"
            >
              {finishNotice}
            </m.div>
          )}
        </AnimatePresence>

        {/* Winner screen (last match's result) — shown alongside the lobby for static rooms,
            which flip back to WAITING immediately so a new round can start right away. */}
        {result && room.status !== 'PLAYING' && (
          <m.section
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 space-y-4 text-center shadow-2xl"
          >
            <div className="flex justify-center">
              <Trophy className="fx-trophy w-14 h-14 text-yellow-400 drop-shadow-lg" />
            </div>
            <h2 className="text-2xl font-bold text-yellow-400">
              {result.ranking.find((r) => r.playerId === result.winnerId)?.nickname ?? 'ไม่มีผู้ชนะ'} ชนะ!
            </h2>
            <p className="text-sm text-zinc-400">
              เหตุผล: {result.reason} · จำนวนตา {result.turns} · เวลาที่ใช้ {Math.round(result.durationMs / 1000)} วินาที
            </p>
            <ol className="text-left space-y-1 max-w-xs mx-auto">
              {result.ranking.map((r, i) => (
                <m.li
                  key={r.playerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex justify-between px-4 py-2 rounded-xl bg-zinc-800/60"
                >
                  <span>#{r.rank} {r.nickname}</span>
                  <span className="text-zinc-400">{r.cardsLeft} ใบเหลือ</span>
                </m.li>
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
          </m.section>
        )}

        {/* Lobby / Waiting */}
        {room.status === 'WAITING' && (
          <section className="rounded-2xl bg-zinc-900/90 border border-zinc-800 p-4 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-zinc-300">
              <Users className="w-5 h-5" /> ผู้เล่นในห้อง ({players.length} คน · ไม่จำกัด)
            </div>
            <ul className="space-y-2">
              {room.players.map((p: Player, i: number) => (
                <m.li
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
                </m.li>
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
                myFinishRank={(() => {
                  const i = game.finishedOrder.indexOf(session?.playerId ?? '');
                  return i >= 0 ? i + 1 : null;
                })()}
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
                  <div className="relative inline-block">
                    <PlayingCard card={game.topCard} faceDown size="md" />
                    <m.span
                      key={game.drawPileCount}
                      initial={{ scale: 1.5 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <span className={`min-w-[2.6em] px-2 py-1 rounded-xl font-black tabular-nums text-center bg-black/75 border-2 shadow-lg text-2xl sm:text-3xl ${game.drawPileCount === 0 ? 'border-red-400 text-red-300' : game.drawPileCount <= 10 ? 'border-orange-400 text-orange-200' : 'border-white/70 text-white'}`}>
                        {game.drawPileCount}
                      </span>
                    </m.span>
                  </div>
                  <p className="text-xs text-zinc-300 font-semibold">{game.drawPileCount === 0 ? 'หมดกอง — ขโมยไพ่' : `เหลือ ${game.drawPileCount} ใบ`}</p>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs text-zinc-400">ไพ่กลาง</p>
                  <AnimatePresence mode="popLayout">
                    <m.div
                      key={(optimistic?.top ?? game.topCard).id}
                      initial={{ opacity: 0, scale: 0.4, rotate: -25, y: optimistic?.top ? 160 : -20 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 15 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <PlayingCard card={optimistic?.top ?? game.topCard} size="lg" />
                    </m.div>
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

              {/* player ring — single row, scrolls sideways when crowded */}
              <div className="relative pt-3">
              <DirectionFlipFlash direction={game.direction} />
              <SeatRow currentId={game.currentPlayerId} className="gap-x-1.5 gap-y-5 items-start px-1 pt-2">
                {seated.map((p: Player, seatNo: number) => {
                  const isCurrent = p.id === game.currentPlayerId;
                  const finishRank = game.finishedOrder.indexOf(p.id);
                  const hasFinished = finishRank >= 0;
                  const activeN = game.seatOrder.length;
                  const isActive = seatNo < activeN;
                  const dir = game.direction;
                  return (
                    <Fragment key={p.id}>
                    <m.div layout data-seat={p.id} transition={{ type: 'spring', stiffness: 300, damping: 26 }} className="flex flex-col items-center gap-1 shrink-0 w-14">
                      <m.div
                        className={`relative rounded-full border-2 ${
                          hasFinished ? 'border-yellow-400' : isCurrent ? 'border-emerald-300 fx-turn-ring fx-pulse' : p.id === nextId ? 'border-amber-400 ring-2 ring-amber-400/60' : 'border-zinc-600'
                        } ${p.avatar ? '' : isCurrent ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                      >
                        <Avatar nickname={p.nickname} avatar={p.avatar} size="md" />
                        {p.id === nextId && !isCurrent && <NextBadge />}
                        {hasFinished && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-bold flex items-center justify-center ring-2 ring-zinc-900">
                            {finishRank + 1}
                          </span>
                        )}
                      </m.div>
                      <span className="text-[11px] text-zinc-300 max-w-full truncate">{!hasFinished && <span className="text-zinc-500">{seatNo + 1}. </span>}{p.nickname}</span>
                      <span className="text-[10px] text-zinc-500">
                        {hasFinished ? `ชนะอันดับที่ ${finishRank + 1}` : `${game.cardCounts?.[p.id] ?? p.cardCount} ใบ`}
                      </span>
                    </m.div>
                    {isActive && seatNo < activeN - 1 && <SeatArrow direction={dir} />}
                    </Fragment>
                  );
                })}
              </SeatRow>
              </div>
            </div>

            {game.gameStatus === 'CHOOSING_DIRECTION' && hand?.isMyTurn && (
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 text-center space-y-4"
              >
                <p className="font-bold">เลือกทิศทางการเล่น</p>
                <div className="flex gap-4 justify-center">
                  <m.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectDirection('LEFT')}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-300/50 font-bold text-lg text-white shadow-[0_3px_0_0_rgba(4,65,45,0.75),0_8px_20px_-6px_rgba(16,185,129,0.55)] active:translate-y-[2px] active:shadow-none transition-[transform,filter]"
                  >
                    ⟲ ซ้าย (LEFT)
                  </m.button>
                  <m.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectDirection('RIGHT')}
                    className="px-8 py-4 rounded-2xl bg-gradient-to-b from-sky-400 to-blue-600 hover:from-sky-400 hover:to-blue-500 border border-sky-300/50 font-bold text-lg text-white shadow-[0_3px_0_0_rgba(10,45,90,0.75),0_8px_20px_-6px_rgba(59,130,246,0.55)] active:translate-y-[2px] active:shadow-none transition-[transform,filter]"
                  >
                    ⟳ ขวา (RIGHT)
                  </m.button>
                </div>
              </m.div>
            )}

            {game.pendingDraw && (
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl bg-orange-500/15 border border-orange-400/30 p-4 text-center font-bold text-orange-200"
              >
                {game.pendingDraw.targetId === session?.playerId
                  ? `ถึงตาคุณตอบโต้! เล่น +2/+4/+8 ต่อ, สะท้อน 🪞, โล่ 🛡️ ส่งต่อ หรือจั่วสะสม ${game.pendingDraw.count} ใบ`
                  : `${players.find((p) => p.id === game.pendingDraw?.targetId)?.nickname ?? ''} ต้องตอบโต้ด้วย +2/+4/+8, สะท้อน 🪞, โล่ 🛡️ หรือจั่ว ${game.pendingDraw.count} ใบ`}
              </m.div>
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
                      .filter((c) => !optimistic?.ids.includes(c.id))
                      .sort((a, b) => {
                        const kindOrder: Record<string, number> = { NUMBER: 0, SKIP: 1, REVERSE: 2, DRAW_TWO: 3, WILD: 4, WILD_DRAW_TWO: 5, WILD_DRAW_FOUR: 6, WILD_DRAW_EIGHT: 7, REFLECT: 8, SHIELD: 9, SHUFFLE: 10 };
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
                      const canStackDraw =
                        !!firstSelected && DRAW_FAM.includes(firstSelected.kind) && DRAW_FAM.includes(c.kind) &&
                        (firstSelected.kind === 'DRAW_TWO') === (c.kind === 'DRAW_TWO');
                      const clickable = hand.isMyTurn && !optimistic && (hand.playableCardIds.includes(c.id) || canStack || canStackDraw);
                      return (
                        <m.div
                          key={c.id}
                          layout
                          className="relative"
                          initial={returningIds.includes(c.id) ? { opacity: 0, y: -110, scale: 0.7, rotate: -8 } : false}
                          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, y: -160, scale: 0.75, transition: { duration: 0.22, ease: 'easeOut' } }}
                        >
                          <PlayingCard
                            card={c}
                            playable={clickable}
                            selected={isSelected}
                            onClick={clickable ? handlerFor(c.id) : undefined}
                          />
                          {isSelected && (
                            <m.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-bold flex items-center justify-center ring-2 ring-zinc-900"
                            >
                              {selectedIndex + 1}
                            </m.span>
                          )}
                        </m.div>
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
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
            onClick={() => setPendingWildCardIds(null)}
          >
            <m.div
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
                  <m.button
                    key={opt.color}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => chooseWildColor(opt.color)}
                    className={`py-6 rounded-xl bg-gradient-to-br ${opt.cls} font-bold text-white shadow-lg`}
                  >
                    {opt.label}
                  </m.button>
                ))}
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </main>
  );
}