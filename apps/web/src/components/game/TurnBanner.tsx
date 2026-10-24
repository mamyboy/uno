'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { playClip } from '@/lib/sounds';

/** Big, unmistakable "it's YOUR turn" banner (with a ding + vibration the moment it flips to you),
 *  or a calmer "waiting for X" strip when it's someone else's turn. */
export function TurnBanner({ isMyTurn, myName, currentName, mustCounter, comboCount, myFinishRank }: {
  isMyTurn: boolean;
  myName: string;
  currentName: string;
  mustCounter?: boolean;
  comboCount?: number;
  /** 1-based finish rank once I've gone out this match (null/undefined while still playing). */
  myFinishRank?: number | null;
}) {
  const was = useRef(false);
  useEffect(() => {
    if (isMyTurn && !was.current) {
      playClip('ding-sound-effect-2', 0.8);
      try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
    }
    was.current = isMyTurn;
  }, [isMyTurn]);

  return (
    <div className="sticky top-2 z-40">
      <AnimatePresence mode="wait">
        {myFinishRank ? (
          <m.div
            key="finished"
            initial={{ y: -40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="relative overflow-hidden rounded-2xl px-4 py-3 sm:py-4 text-center border-2 border-yellow-300 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-[0_10px_40px_-8px_rgba(250,204,21,0.8)]"
          >
            <p className="fx-pulse-soft relative font-black text-2xl sm:text-4xl text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
              {myFinishRank === 1 ? '🏆' : '🎉'} {myName} — ชนะอันดับที่ {myFinishRank}!
            </p>
            <p className="relative text-sm sm:text-base font-bold text-white/95">
              {currentName ? `รออีกฝั่งเล่นต่อ — ตอนนี้เป็นตาของ ${currentName}` : 'รอจบรอบนี้...'}
            </p>
          </m.div>
        ) : isMyTurn ? (
          <m.div
            key="mine"
            initial={{ y: -40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className={`relative overflow-hidden rounded-2xl px-4 py-3 sm:py-4 text-center border-2 shadow-[0_10px_40px_-8px_rgba(16,185,129,0.8)] ${
              mustCounter ? 'bg-gradient-to-r from-red-600 via-orange-500 to-red-600 border-yellow-300' : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 border-white/70'
            }`}
          >
            <div
              className="fx-sweep absolute inset-0"
              style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)' }}
            />
            <p className="fx-pulse relative font-black text-2xl sm:text-4xl text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
              🎯 {myName} — ถึงตาคุณแล้ว!
            </p>
            <p className="relative text-sm sm:text-base font-bold text-white/95">
              {mustCounter ? `โดนคอมโบ +${comboCount ?? 0}! ลงไพ่ +2/+4/+8 ต่อ, สะท้อน 🪞, โล่ 🛡️ ส่งต่อ หรือจั่วรับ` : 'เลือกไพ่ด้านล่างเพื่อเล่นได้เลย 👇'}
            </p>
          </m.div>
        ) : currentName ? (
          <m.div
            key="other"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl px-4 py-2 text-center bg-zinc-900/85 border border-zinc-700"
          >
            <span className="text-zinc-400 text-sm">⏳ ตาของ </span>
            <span className="font-black text-lg text-amber-300">{currentName}</span>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
