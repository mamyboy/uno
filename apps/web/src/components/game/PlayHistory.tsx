'use client';

import { memo } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { GameState, HistoryEntry } from '@cma/shared';
import { PlayingCard } from './PlayingCard';

function describe(h: HistoryEntry, nameOf: (id: string | null | undefined) => string): string {
  const who = nameOf(h.playerId);
  switch (h.action) {
    case 'PLAY':
      return `${who} ลงไพ่`;
    case 'DRAW':
      return `${who} จั่วไพ่`;
    case 'STEAL':
      return `${who} ขโมยไพ่จาก ${nameOf(h.fromPlayerId)}`;
    case 'ABSORB':
      return `${who} รับคอมโบ +${h.count ?? 0}`;
    case 'REFLECT':
      return `${who} สะท้อน +${h.count ?? 0} ➜ ${nameOf(h.toPlayerId)}`;
    case 'SHIELD':
      return `${who} ใช้โล่ 🛡️ ส่งคอมโบ +${h.count ?? 0} ➜ ${nameOf(h.toPlayerId)}`;
    case 'SHUFFLE_SEATS':
      return `${who} สลับที่นั่ง 🔀 ${(h.seatOrder ?? []).map((id) => nameOf(id)).join(' → ')} (ลงไพ่ต่อ)`;
    case 'STEAL_COMBO':
      return h.fromPlayerId
        ? `${who} ขโมยคอมโบ 🦹 ${h.card?.kind === 'WILD_DRAW_EIGHT' ? '+8' : h.card?.kind === 'WILD_DRAW_FOUR' ? '+4' : '+2'} จาก ${nameOf(h.fromPlayerId)} (ลงไพ่ต่อ)`
        : `${who} ใช้ขโมยคอมโบ 🦹 แต่ไม่มีใครมี Wild Draw ให้ขโมย (ลงไพ่ต่อ)`;
    case 'VANISH':
      return `ไพ่สะท้อน/โล่ของ ${who} หายไป`;
    case 'SKIP':
      return `${who} ถูกข้ามตา`;
    case 'DIRECTION':
      return `${who} เลือกทิศ ${h.direction === 'LEFT' ? 'ซ้าย ⟲' : 'ขวา ⟳'}`;
    default:
      return who;
  }
}

/** Running log of what previous players did — newest first, with the actual cards they laid down. */
function PlayHistoryImpl({ game, nameOf, limit = 14, compact }: { game: GameState; nameOf: (id: string | null | undefined) => string; limit?: number; compact?: boolean }) {
  // collapse consecutive DRAW entries by the same player into one line
  const items: (HistoryEntry & { times?: number })[] = [];
  for (const h of game.history) {
    const prev = items[items.length - 1];
    if (prev && h.action === 'DRAW' && prev.action === 'DRAW' && prev.playerId === h.playerId) {
      prev.times = (prev.times ?? 1) + 1;
      continue;
    }
    items.push({ ...h });
  }
  const list = items.slice(-limit).reverse();

  return (
    <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-3 sm:p-4">
      <p className="text-sm font-semibold text-zinc-300 mb-2">📜 ประวัติการลงไพ่</p>
      {list.length === 0 && <p className="text-xs text-zinc-500">ยังไม่มีการลงไพ่</p>}
      <ul className={compact ? 'space-y-1.5 max-h-64 overflow-y-auto pr-1' : 'space-y-2 max-h-[60vh] overflow-y-auto pr-1'}>
        <AnimatePresence initial={false}>
          {list.map((h, i) => {
            const cards = h.cards ?? (h.card && (h.action === 'PLAY' || h.action === 'REFLECT' || h.action === 'SHIELD' || h.action === 'SHUFFLE_SEATS' || h.action === 'STEAL_COMBO') ? [h.card] : []);
            return (
              <m.li
                key={h.seq}
                layout
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.05), x: 0, scale: 1 }}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl ${i === 0 ? 'bg-emerald-500/15 border border-emerald-400/30' : 'bg-zinc-800/50'}`}
              >
                <span className="text-[10px] text-zinc-500 w-8 shrink-0">ตา {h.turnNumber}</span>
                <span className={`flex-1 min-w-0 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                  {describe(h, nameOf)}
                  {h.times && h.times > 1 ? ` ×${h.times}` : ''}
                </span>
                {cards.length > 0 && (
                  <span className="flex -space-x-4 shrink-0">
                    {cards.slice(0, 5).map((c) => (
                      <PlayingCard key={c.id} card={c} size="xs" />
                    ))}
                  </span>
                )}
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

const lastSeq = (g: GameState) => (g.history.length ? g.history[g.history.length - 1].seq : 0);
/** Only re-render when a new history entry arrives (not on every unrelated state update). */
export const PlayHistory = memo(
  PlayHistoryImpl,
  (a, b) => a.game.gameId === b.game.gameId && lastSeq(a.game) === lastSeq(b.game) && a.game.history.length === b.game.history.length && a.limit === b.limit && a.compact === b.compact,
);
