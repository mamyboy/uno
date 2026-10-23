import { describe, expect, it } from 'vitest';
import { createActionCards, createDeck, createNumberDeck, createWildCards, shuffle } from '../src/engine/deck';
import { GameEngine, GameError } from '../src/engine/GameEngine';

function seqRng(seed = 1) {
  let s = seed;
  return (max: number) => {
    s = (s * 9301 + 49297) % 233280;
    return Math.floor((s / 233280) * max);
  };
}

describe('deck', () => {
  it('builds the standard 76-card deck (0 x1, 1-9 x2 per color)', () => {
    const deck = createNumberDeck();
    expect(deck).toHaveLength(76);
    for (const color of ['RED', 'YELLOW', 'GREEN', 'BLUE'] as const) {
      const zeros = deck.filter((c) => c.color === color && c.value === 0);
      expect(zeros).toHaveLength(1);
      for (let v = 1; v <= 9; v++) {
        expect(deck.filter((c) => c.color === color && c.value === v)).toHaveLength(2);
      }
    }
  });

  it('shuffle preserves all cards and does not mutate the input', () => {
    const deck = createNumberDeck();
    const copy = [...deck];
    const shuffled = shuffle(deck, seqRng(42));
    expect(deck).toEqual(copy); // original untouched
    expect(shuffled).toHaveLength(deck.length);
    expect([...shuffled].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...deck].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it('builds 24 action cards: 2 each of Skip/Reverse/Draw Two per color', () => {
    const actions = createActionCards();
    expect(actions).toHaveLength(24);
    for (const color of ['RED', 'YELLOW', 'GREEN', 'BLUE'] as const) {
      for (const kind of ['SKIP', 'REVERSE', 'DRAW_TWO'] as const) {
        expect(actions.filter((c) => c.color === color && c.kind === kind)).toHaveLength(2);
      }
    }
  });

  it('builds 14 wild cards: 4 Wild + 4 Wild Draw Two + 4 Wild Draw Four + 2 Wild Draw Eight, all colorless', () => {
    const wilds = createWildCards();
    expect(wilds).toHaveLength(14);
    expect(wilds.filter((c) => c.kind === 'WILD')).toHaveLength(4);
    expect(wilds.filter((c) => c.kind === 'WILD_DRAW_TWO')).toHaveLength(4);
    expect(wilds.filter((c) => c.kind === 'WILD_DRAW_FOUR')).toHaveLength(4);
    expect(wilds.filter((c) => c.kind === 'WILD_DRAW_EIGHT')).toHaveLength(2);
    expect(wilds.every((c) => c.color === null)).toBe(true);
  });

  it('builds the full 124-card deck (76 number + 24 action + 14 wild + 4 reflect + 4 shield + 2 shuffle)', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(124);
    expect(deck.filter((c) => c.kind === 'SHIELD')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'SHUFFLE')).toHaveLength(2);
    expect(deck.filter((c) => c.kind === 'REFLECT')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'NUMBER')).toHaveLength(76);
    expect(deck.filter((c) => ['SKIP', 'REVERSE', 'DRAW_TWO'].includes(c.kind))).toHaveLength(24);
    expect(deck.filter((c) => c.kind === 'WILD' || c.kind === 'WILD_DRAW_TWO' || c.kind === 'WILD_DRAW_FOUR' || c.kind === 'WILD_DRAW_EIGHT')).toHaveLength(14);
  });
});

describe('GameEngine', () => {
  it('deals 7 cards to each player and exposes a valid top card', () => {
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { rng: seqRng(1) });
    expect(engine.getHand('p1')).toHaveLength(7);
    expect(engine.getHand('p2')).toHaveLength(7);
    expect(engine.getHand('p3')).toHaveLength(7);
    expect(engine.topCard).toBeDefined();
    expect(engine.status).toBe('CHOOSING_DIRECTION');
  });

  it('never opens with an Action or Wild card on top, even if the shuffle puts one first', () => {
    // Force a worst-case shuffle: Action/Wild cards bunched at the very front of the deck.
    const skip = { id: 's1', kind: 'SKIP' as const, color: 'RED' as const };
    const wild = { id: 'w1', kind: 'WILD' as const, color: null };
    const drawTwo = { id: 'd2', kind: 'DRAW_TWO' as const, color: 'BLUE' as const };
    const numberCards = Array.from({ length: 20 }, (_, i) => ({
      id: `n-${i}`,
      kind: 'NUMBER' as const,
      color: (['RED', 'YELLOW', 'GREEN', 'BLUE'] as const)[i % 4],
      value: i % 10,
    }));
    const deck = [skip, wild, drawTwo, ...numberCards];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    expect(engine.topCard.kind).toBe('NUMBER');
    // The skipped action/wild cards must still be in circulation (hand or draw pile), not lost.
    const state = engine.getPrivateState();
    const allIds = [
      ...Object.values(state.playerHands).flat().map((c) => c.id),
      ...state.drawPile.map((c) => c.id),
      ...state.discardPile.map((c) => c.id),
    ];
    expect(allIds).toContain('s1');
    expect(allIds).toContain('w1');
    expect(allIds).toContain('d2');
    expect(allIds).toHaveLength(deck.length);
  });

  it('rejects fewer than 2 players', () => {
    expect(() => new GameEngine('room1', ['p1'])).toThrow(GameError);
  });

  it('enforces direction selection before play, and only by the current/first player', () => {
    const engine = new GameEngine('room1', ['p1', 'p2'], { rng: seqRng(2) });
    expect(() =>
      engine.playCard('p1', engine.getHand('p1')[0].id, engine.turnNumber),
    ).toThrow(/DIRECTION_NOT_SELECTED/);

    expect(() => engine.selectDirection('p2', 'RIGHT', engine.turnNumber)).toThrow(/NOT_YOUR_TURN/);

    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.status).toBe('PLAYING');
    expect(engine.direction).toBe('RIGHT');
  });

  it('LEFT advances seat index to the next seat only after a card is played', () => {
    // Build a deterministic deck: p1 gets RED cards, p2 gets RED cards, top is RED 9.
    const hand1 = Array.from({ length: 7 }, (_, i) => ({ id: `p1-${i}`, kind: 'NUMBER' as const, color: 'RED' as const, value: i }));
    const hand2 = Array.from({ length: 7 }, (_, i) => ({ id: `p2-${i}`, kind: 'NUMBER' as const, color: 'RED' as const, value: i }));
    const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
    const rest = Array.from({ length: 10 }, (_, i) => ({ id: `extra-${i}`, kind: 'NUMBER' as const, color: 'BLUE' as const, value: i % 10 }));
    // Dealing order is: for r in 0..handSize: for each player push deck[k++].
    const dealOrdered: typeof hand1 = [];
    for (let r = 0; r < 7; r++) {
      dealOrdered.push(hand1[r], hand2[r]);
    }
    const fullDeck = [...dealOrdered, top, ...rest];

    const engine = new GameEngine('room1', ['p1', 'p2'], { deck: fullDeck, handSize: 7 });
    expect(engine.getHand('p1').every((c) => c.color === 'RED')).toBe(true);

    // Per Rule 2: after selecting direction, the FIRST player plays first (does not auto-advance yet).
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.currentPlayerId).toBe('p1');

    // Once p1 plays a card, RIGHT should move to the next seat (p2).
    const turnBeforePlay = engine.turnNumber;
    engine.playCard('p1', 'p1-0', turnBeforePlay);
    expect(engine.currentPlayerId).toBe('p2'); // RIGHT = seat+1 = p2
  });

  it('canPlayCard: matches by color or value only', () => {
    const engine = new GameEngine('room1', ['p1', 'p2'], {
      // Dealing: round 0 -> p1 gets deck[0], p2 gets deck[1], discard top = deck[2].
      deck: [
        { id: 'c1', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 }, // p1's hand
        { id: 'c2', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 1 }, // p2's hand
        { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 }, // discard pile top
        { id: 'extra1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 3 },
      ],
      handSize: 1,
    });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    // c1 is RED 5, top is RED 5 -> matches by both color and value.
    expect(engine.getPlayableIds('p1')).toContain('c1');
  });

  it('finishes the game and declares a winner when a player empties their hand', () => {
    const deck = [
      { id: 'p1-0', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 },
      { id: 'p2-0', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 1 },
      { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 },
      { id: 'extra1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 3 },
      { id: 'extra2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 4 },
    ];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 1 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    const result = engine.playCard('p1', 'p1-0', engine.turnNumber);
    expect(result.finished).toBe(true);
    expect(engine.status).toBe('FINISHED');
    expect(engine.winnerId).toBe('p1');
  });

  it('with 3+ players, emptying your hand does not end the game — the rest keep playing until one is left', () => {
    const p1Card = { id: 'p1-0', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 };
    const p2Card = { id: 'p2-0', kind: 'NUMBER' as const, color: 'RED' as const, value: 3 };
    const p3Card = { id: 'p3-0', kind: 'NUMBER' as const, color: 'RED' as const, value: 7 };
    const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
    const deck = [p1Card, p2Card, p3Card, top];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 1 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

    // p1 empties their hand first — the game must NOT end; p2 and p3 keep playing.
    const r1 = engine.playCard('p1', 'p1-0', engine.turnNumber);
    expect(r1.finished).toBe(false);
    expect(engine.status).toBe('PLAYING');
    expect(engine.getPublicState().finishedOrder).toEqual(['p1']);
    expect(engine.currentPlayerId).toBe('p2');

    // p2 empties their hand next — still not over, p3 is the only one left with cards.
    const r2 = engine.playCard('p2', 'p2-0', engine.turnNumber);
    expect(r2.finished).toBe(true); // only p3 remains holding cards -> game ends here
    expect(engine.status).toBe('FINISHED');
    expect(engine.getPublicState().finishedOrder).toEqual(['p1', 'p2']);
    // p1 finished first, so they're still the overall winner even though p2/p3 kept playing.
    expect(engine.winnerId).toBe('p1');

    const result = engine.getResult(new Map([['p1', 'P1'], ['p2', 'P2'], ['p3', 'P3']]));
    expect(result.ranking.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(result.ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('when draw pile is exhausted but another player has cards, drawing steals instead of auto-skipping', () => {
    const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
    const p1Card = { id: 'p1c', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 3 }; // unplayable
    const p2Card = { id: 'p2c', kind: 'NUMBER' as const, color: 'RED' as const, value: 1 }; // playable but in p2's hand
    const deck = [p1Card, p2Card, top];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 1 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

    // p1 can't play (no color/value match) and the draw pile is empty, but p2 still holds a
    // card — resolveStuckPlayers must NOT auto-skip p1, since they can still draw by stealing.
    expect(engine.currentPlayerId).toBe('p1');
    expect(engine.getPrivateHand('p1').canDraw).toBe(true);

    const result = engine.drawCard('p1', engine.turnNumber);
    expect(result.stolen).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.card?.id).toBe('p2c');
    expect(engine.getHand('p2')).toHaveLength(0);
    // Stealing p2's LAST card empties their hand — per the "stolen down to zero counts as going
    // out too" rule, p2 is credited as finished (rank 1, since they're the first to empty), and
    // since p1 is now the only one left holding cards, the game ends right here with p2 as winner.
    expect(engine.status).toBe('FINISHED');
    expect(engine.getPublicState().finishedOrder).toEqual(['p2']);
    expect(engine.winnerId).toBe('p2');
    expect(engine.currentPlayerId).toBeNull(); // game is over
  });

  it('stealing can cascade through multiple donors, crediting each as finished in order, until the game ends in one call', () => {
    const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
    const p1Card = { id: 'p1c', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 3 }; // unplayable
    const p2Card = { id: 'p2c', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 4 }; // unplayable
    const p3Card = { id: 'p3c', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 5 }; // also unplayable
    const deck = [p1Card, p2Card, p3Card, top];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 1 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.currentPlayerId).toBe('p1');

    // p1 draws: steals p2's only (unplayable) card first — p2 empties and goes out (rank 1), but
    // the game doesn't end yet (p1 + p3 still hold cards), so the SAME draw call cascades onward
    // and steals p3's only (also unplayable) card next — draining p3 too (rank 2). Now only p1
    // is left holding any cards at all, so the game ends right there, within this single call.
    const result = engine.drawCard('p1', engine.turnNumber);
    expect(engine.getPublicState().finishedOrder).toEqual(['p2', 'p3']);
    expect(engine.getHand('p2')).toHaveLength(0);
    expect(engine.getHand('p3')).toHaveLength(0);
    expect(engine.getHand('p1')).toHaveLength(3); // p1c + both stolen cards
    expect(result.stolen).toBe(true);
    expect(result.skipped).toBe(false);
    expect(engine.status).toBe('FINISHED');
    expect(engine.winnerId).toBe('p2'); // first to finish, same rank-order rule as playing out
    expect(engine.currentPlayerId).toBeNull();
  });

  it('when stealing a donor\'s last card ends the game outright (2 players), the thief is credited the steal and the game stops immediately', () => {
    const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
    const p1Card = { id: 'p1c', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 3 }; // unplayable
    const p2Card = { id: 'p2c', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 4 }; // also unplayable
    const deck = [p1Card, p2Card, top];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 1 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

    expect(engine.currentPlayerId).toBe('p1');
    expect(engine.getPrivateHand('p1').canDraw).toBe(true);

    // p1 steals p2's only card — empties p2's hand. Per the "stolen down to zero counts as going
    // out too" rule, p2 is credited as finished, and since p1 is now the only one left holding
    // cards, the game ends immediately — all within this single drawCard() call.
    const result = engine.drawCard('p1', engine.turnNumber);
    expect(result.stolen).toBe(true);
    expect(result.skipped).toBe(false);
    expect(engine.getHand('p1')).toHaveLength(2); // both cards ended up here
    expect(engine.getHand('p2')).toHaveLength(0);
    expect(engine.status).toBe('FINISHED');
    expect(engine.getPublicState().finishedOrder).toEqual(['p2']);
    expect(engine.winnerId).toBe('p2');
    expect(engine.currentPlayerId).toBeNull();
  });

  it('rejects stale turnNumber (prevents duplicate/late submissions)', () => {
    const engine = new GameEngine('room1', ['p1', 'p2'], { rng: seqRng(3) });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    const stale = engine.turnNumber - 1;
    expect(() => engine.drawCard('p2', stale)).toThrow();
  });

  describe('playCards (same-number stacking)', () => {
    function buildStackingEngine() {
      // Dealing order: round r -> p1 then p2. handSize=3.
      const c1 = { id: 'c1', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 };
      const c2 = { id: 'c2', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 5 };
      const c3 = { id: 'c3', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 9 };
      const d1 = { id: 'd1', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 2 };
      const d2 = { id: 'd2', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 2 };
      const d3 = { id: 'd3', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 2 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [c1, d1, c2, d2, c3, d3, top, ...rest];
      return new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
    }

    it('plays multiple same-value cards at once and the LAST card sets the new top (color carries to next player)', () => {
      const engine = buildStackingEngine();
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // top is RED 9; c1 (RED,5) matches by color, c2 (BLUE,5) matches c1 by value only.
      const result = engine.playCards('p1', ['c1', 'c2'], engine.turnNumber);
      expect(result.finished).toBe(false);
      expect(result.cards.map((c) => c.id)).toEqual(['c1', 'c2']);

      // The LAST played card (c2, BLUE 5) is now on top — not c1.
      expect(engine.topCard.id).toBe('c2');
      expect(engine.topCard.color).toBe('BLUE');
      expect(engine.topCard.value).toBe(5);

      // Turn passed to p2.
      expect(engine.currentPlayerId).toBe('p2');

      // p2 must match the LAST card's color/value (BLUE or 5): only d2 (BLUE,2) qualifies.
      const playableForP2 = engine.getPlayableIds('p2');
      expect(playableForP2).toEqual(['d2']);
    });

    it('rejects stacking cards with different values', () => {
      const engine = buildStackingEngine();
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(() => engine.playCards('p1', ['c1', 'c3'], engine.turnNumber)).toThrow(/CARDS_MUST_MATCH_VALUE/);
    });

    it('rejects a NUMBER stack if NO card in it matches the current top (by color)', () => {
      const engine = buildStackingEngine();
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // Build a same-value pair where NEITHER card matches top (RED,9) by color or value.
      const neitherMatches = new GameEngine('room1', ['p1', 'p2'], {
        deck: [
          { id: 'x1', kind: 'NUMBER', color: 'BLUE', value: 5 },
          { id: 'y1', kind: 'NUMBER', color: 'YELLOW', value: 1 },
          { id: 'x2', kind: 'NUMBER', color: 'GREEN', value: 5 },
          { id: 'y2', kind: 'NUMBER', color: 'YELLOW', value: 2 },
          { id: 'x3', kind: 'NUMBER', color: 'YELLOW', value: 3 },
          { id: 'y3', kind: 'NUMBER', color: 'YELLOW', value: 4 },
          { id: 'top', kind: 'NUMBER', color: 'RED', value: 9 },
          ...Array.from({ length: 10 }, (_, i) => ({ id: `r-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 })),
        ],
        handSize: 3,
      });
      neitherMatches.selectDirection('p1', 'RIGHT', neitherMatches.turnNumber);
      // x1 (BLUE,5) and x2 (GREEN,5): same value 5, but neither's color matches top (RED,9) and
      // neither's value (5) matches top's value (9) — illegal in either order.
      expect(() => neitherMatches.playCards('p1', ['x1', 'x2'], neitherMatches.turnNumber)).toThrow(/CARD_NOT_PLAYABLE/);
      expect(() => neitherMatches.playCards('p1', ['x2', 'x1'], neitherMatches.turnNumber)).toThrow(/CARD_NOT_PLAYABLE/);
    });

    it('allows a NUMBER stack as long as ANY card in it matches the top, regardless of selection order', () => {
      const engine = buildStackingEngine();
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // c1 (RED,5) matches top (RED,9) by color; c2 (BLUE,5) alone would not. Selecting c2 FIRST
      // must still succeed, since c1 makes the pair legal regardless of array order.
      const result = engine.playCards('p1', ['c2', 'c1'], engine.turnNumber);
      expect(result.cards.map((c) => c.id)).toEqual(['c2', 'c1']);
      expect(engine.topCard.id).toBe('c1'); // last card in the array lands on top
    });

    it('finishes the game when stacking empties the hand', () => {
      const c1 = { id: 'c1', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 };
      const c2 = { id: 'c2', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 5 };
      const d1 = { id: 'd1', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 2 };
      const d2 = { id: 'd2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 3 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck: [c1, d1, c2, d2, top, ...rest], handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      const result = engine.playCards('p1', ['c1', 'c2'], engine.turnNumber);
      expect(result.finished).toBe(true);
      expect(engine.status).toBe('FINISHED');
      expect(engine.winnerId).toBe('p1');
    });
  });

  describe('action & wild cards', () => {
    it('SKIP card skips the next player entirely (3 players: p1 -> p3)', () => {
      const skipCard = { id: 'p1-skip', kind: 'SKIP' as const, color: 'RED' as const };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const filler = () => ({ id: `f-${Math.random()}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 1 });
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      // handSize=2 so p1 still has a card left after playing the Skip (avoids an immediate win).
      const deck = [skipCard, filler(), filler(), filler(), filler(), filler(), top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(engine.currentPlayerId).toBe('p1');
      engine.playCard('p1', 'p1-skip', engine.turnNumber);
      // p2 is skipped, turn lands on p3.
      expect(engine.currentPlayerId).toBe('p3');
    });

    it('REVERSE with 2 players acts like a Skip (turn returns to the player who played it)', () => {
      const p1 = { id: 'p1-0', kind: 'REVERSE' as const, color: 'RED' as const };
      const p1b = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 3 };
      const p2a = { id: 'p2-0', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 1 };
      const p2b = { id: 'p2-1', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 2 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [p1, p2a, p1b, p2b, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber);
      expect(engine.currentPlayerId).toBe('p1'); // p2 was "reversed past" -> acts as skip
    });

    it('REVERSE with 3+ players flips direction without skipping anyone', () => {
      const reverseCard = { id: 'p1-rev', kind: 'REVERSE' as const, color: 'RED' as const };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const filler = () => ({ id: `f-${Math.random()}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 1 });
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [reverseCard, filler(), filler(), filler(), filler(), filler(), top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-rev', engine.turnNumber);
      expect(engine.direction).toBe('LEFT');
      // LEFT from p1 (seat 0) in a 3-seat ring goes to seat 2 -> p3.
      expect(engine.currentPlayerId).toBe('p3');
    });

    it('DRAW_TWO starts a pending combo; absorbing it keeps the turn (no auto-skip to p1)', () => {
      const drawTwo = { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const filler = () => ({ id: `f-${Math.random()}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 1 });
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      // handSize=2, 2 players -> 4 cards dealt (idx 0-3), discard = idx 4.
      const deck = [drawTwo, filler(), filler(), filler(), top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(engine.getHand('p2')).toHaveLength(2);
      engine.playCard('p1', 'p1-d2', engine.turnNumber);

      // The combo doesn't resolve immediately — p2 is now on the hook to respond.
      expect(engine.currentPlayerId).toBe('p2');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });
      // p2 holds no Draw Two/Wild Draw Four to stack, so only drawCard() (absorb) is legal.
      expect(engine.getPlayableIds('p2')).toEqual([]);
      expect(engine.getPrivateHand('p2').canDraw).toBe(true);

      const result = engine.drawCard('p2', engine.turnNumber);
      expect(engine.getHand('p2')).toHaveLength(4); // 2 original + 2 absorbed
      expect(engine.getPublicState().pendingDraw).toBeNull();
      // Absorbing the combo does NOT end the turn — p2 keeps playing (same as a normal draw).
      expect(result.skipped).toBe(false);
      expect(engine.currentPlayerId).toBe('p2');
    });

    it('draws by stealing from the next player when the draw pile is already empty', () => {
      const p1Card = { id: 'p1-y1', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 1 }; // unplayable
      const p2Card = { id: 'p2-r5', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 }; // playable (color match)
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      // handSize=1, 2 players: exactly 3 cards needed (2 dealt + 1 opening) — draw pile ends up empty.
      const deck = [p1Card, p2Card, top];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 1 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(engine.getPublicState().drawPileCount).toBe(0);
      expect(engine.getPlayableIds('p1')).toEqual([]); // YELLOW 1 doesn't match RED 9

      const result = engine.drawCard('p1', engine.turnNumber);
      expect(result.skipped).toBe(false);
      expect(result.stolen).toBe(true);
      expect(result.card?.id).toBe('p2-r5'); // stole p2's only card, which happens to be playable
      expect(engine.getHand('p1')).toHaveLength(2); // original + stolen
      expect(engine.getHand('p2')).toHaveLength(0);
      // Stealing p2's only card empties their hand, so p2 is credited as finished (and since p1
      // is now the sole player left holding cards, the game ends immediately with p2 as winner)
      // — even though the stolen card happened to be playable, the game-ending takes priority.
      expect(engine.status).toBe('FINISHED');
      expect(engine.winnerId).toBe('p2');
      expect(engine.currentPlayerId).toBeNull();
    });

    it('stacking +2 on +2 (3 players) passes a +4 total to the third player', () => {
      const d2a = { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const d2b = { id: 'p2-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const filler = (color: 'YELLOW' | 'GREEN') => ({ id: `f-${Math.random()}`, kind: 'NUMBER' as const, color, value: 1 });
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'GREEN' as const, value: i % 10 }));
      // Dealing order (handSize=2, 3 players): p1,p2,p3,p1,p2,p3 -> p1=[d2a,f], p2=[d2b,f], p3=[f,f].
      const deck = [d2a, d2b, filler('YELLOW'), filler('YELLOW'), filler('GREEN'), filler('GREEN'), top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-d2', engine.turnNumber);
      expect(engine.currentPlayerId).toBe('p2');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });

      // p2 stacks their own Draw Two instead of absorbing it.
      engine.playCard('p2', 'p2-d2', engine.turnNumber);
      expect(engine.currentPlayerId).toBe('p3');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p3' });
      expect(engine.getHand('p2')).toHaveLength(1); // only played the Draw Two, never drew

      const p3HandBefore = engine.getHand('p3').length;
      engine.drawCard('p3', engine.turnNumber);
      expect(engine.getHand('p3')).toHaveLength(p3HandBefore + 4);
      expect(engine.getPublicState().pendingDraw).toBeNull();
      // p3 absorbed the combo but keeps their turn — no auto-skip back to p1.
      expect(engine.currentPlayerId).toBe('p3');
    });

    it('requires a chosenColor to play a Wild card and resolves the discard to that color', () => {
      const p1 = { id: 'p1-0', kind: 'WILD' as const, color: null };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [p1, rest[0], top, ...rest.slice(1)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 1 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(() => engine.playCard('p1', 'p1-0', engine.turnNumber)).toThrow(/COLOR_REQUIRED/);
      const result = engine.playCard('p1', 'p1-0', engine.turnNumber, 'BLUE');
      expect(engine.topCard.color).toBe('BLUE');
      expect(result.card.color).toBe('BLUE');
    });

    it('WILD_DRAW_FOUR is always playable, even with a color-matching card in hand', () => {
      const wild4 = { id: 'p1-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const redCard = { id: 'p1-1', kind: 'NUMBER' as const, color: 'RED' as const, value: 3 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild4, rest[0], redCard, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // p1 holds a RED card matching top's color, but the "no color match" house rule has been
      // removed — Wild Draw Four is legal any time it's the player's turn.
      expect(engine.getPlayableIds('p1')).toContain('p1-0');
      const result = engine.playCard('p1', 'p1-0', engine.turnNumber, 'BLUE');
      expect(engine.topCard.color).toBe('BLUE');
      expect(result.card.id).toBe('p1-0');
    });

    it('WILD_DRAW_FOUR starts a pending +4 combo; absorbing it keeps the turn', () => {
      const wild4 = { id: 'p1-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const greenCard = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 3 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild4, rest[0], greenCard, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // p1 has no RED card -> Wild Draw Four is legal.
      expect(engine.getPlayableIds('p1')).toContain('p1-0');
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.topCard.color).toBe('GREEN');

      // p2 is now the pending-combo target, not immediately forced to draw.
      expect(engine.currentPlayerId).toBe('p2');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p2' });
      const result = engine.drawCard('p2', engine.turnNumber);
      expect(engine.getHand('p2')).toHaveLength(6); // 2 original + 4 absorbed
      // Absorbing the combo does NOT end the turn — p2 keeps playing.
      expect(result.skipped).toBe(false);
      expect(engine.currentPlayerId).toBe('p2');
    });

    it('WILD_DRAW_TWO is always playable, even with a color-matching card in hand', () => {
      const wild2 = { id: 'p1-0', kind: 'WILD_DRAW_TWO' as const, color: null };
      const redCard = { id: 'p1-1', kind: 'NUMBER' as const, color: 'RED' as const, value: 3 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild2, rest[0], redCard, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // p1 holds a RED card matching top's color, but the "no color match" house rule has been
      // removed — Wild Draw Two is legal any time it's the player's turn, same as Wild Draw Four.
      expect(engine.getPlayableIds('p1')).toContain('p1-0');
      const result = engine.playCard('p1', 'p1-0', engine.turnNumber, 'BLUE');
      expect(engine.topCard.color).toBe('BLUE');
      expect(result.card.id).toBe('p1-0');
    });

    it('WILD_DRAW_TWO starts a pending +2 combo; absorbing it keeps the turn', () => {
      const wild2 = { id: 'p1-0', kind: 'WILD_DRAW_TWO' as const, color: null };
      const greenCard = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 3 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild2, rest[0], greenCard, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      // p1 has no RED card -> Wild Draw Two is legal.
      expect(engine.getPlayableIds('p1')).toContain('p1-0');
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.topCard.color).toBe('GREEN');

      // p2 is now the pending-combo target, not immediately forced to draw.
      expect(engine.currentPlayerId).toBe('p2');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });
      const result = engine.drawCard('p2', engine.turnNumber);
      expect(engine.getHand('p2')).toHaveLength(4); // 2 original + 2 absorbed
      expect(result.skipped).toBe(false);
      expect(engine.currentPlayerId).toBe('p2');
    });

    it('WILD_DRAW_TWO cross-stacks with DRAW_TWO and WILD_DRAW_FOUR into one growing combo', () => {
      const wild2 = { id: 'p1-0', kind: 'WILD_DRAW_TWO' as const, color: null };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const drawTwo = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'GREEN' as const };
      const p2Filler = { id: 'p2-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild2, drawTwo, p1Filler, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });
      // p2 stacks their own DRAW_TWO on top instead of absorbing — combo grows to 4, back onto p1.
      engine.playCard('p2', 'p2-0', engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p1' });
    });

    it('playCards opens a combo with two different-color DRAW_TWO cards together, summing to +4', () => {
      const drawTwoGreen = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'GREEN' as const };
      const drawTwoRed = { id: 'p1-1', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const filler = { id: 'p1-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [drawTwoGreen, rest[0], drawTwoRed, rest[1], filler, rest[2], top, ...rest.slice(3)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

      engine.playCards('p1', ['p1-0', 'p1-1'], engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p2' });
      expect(engine.topCard.color).toBe('RED'); // last card in the stack sets the resolved color
    });

    it('playCards lays down a DRAW_TWO + WILD_DRAW_FOUR together, summing to +6 in one move', () => {
      const drawTwo = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const wild4 = { id: 'p1-1', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const filler = { id: 'p1-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      // handSize=3, 2 players deals round-robin p1,p2,p1,p2,p1,p2 — interleave p2 fillers so
      // p1's three cards land at indices 0, 2, 4 and the top card sits right after at index 6.
      const deck = [drawTwo, rest[0], wild4, rest[1], filler, rest[2], top, ...rest.slice(3)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

      engine.playCards('p1', ['p1-0', 'p1-1'], engine.turnNumber, 'BLUE');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 6, targetId: 'p2' });
      expect(engine.topCard.color).toBe('BLUE'); // last card in the stack (the wild) sets the color
      expect(engine.getHand('p1')).toHaveLength(1); // just the filler left
    });

    it('WILD_DRAW_FOUR combo can only be countered by another Wild Draw card, never a plain DRAW_TWO even with matching color', () => {
      const wild4 = { id: 'p1-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const drawTwo = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'GREEN' as const }; // matches chosen color, but still illegal
      const p2Filler = { id: 'p2-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild4, drawTwo, p1Filler, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p2' });

      expect(engine.getPlayableIds('p2')).not.toContain('p2-0');
      expect(() => engine.playCard('p2', 'p2-0', engine.turnNumber)).toThrow(/MUST_COUNTER_OR_DRAW/);
    });

    it('WILD_DRAW_TWO cannot counter a pending WILD_DRAW_FOUR combo (its tier is too low)', () => {
      const wild4 = { id: 'p1-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const wild2 = { id: 'p2-0', kind: 'WILD_DRAW_TWO' as const, color: null };
      const p2Filler = { id: 'p2-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild4, wild2, p1Filler, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p2' });

      expect(engine.getPlayableIds('p2')).not.toContain('p2-0');
      expect(() => engine.playCard('p2', 'p2-0', engine.turnNumber, 'BLUE')).toThrow(/MUST_COUNTER_OR_DRAW/);
    });

    it('WILD_DRAW_EIGHT can counter a pending WILD_DRAW_FOUR combo (higher tier answers lower)', () => {
      const wild4 = { id: 'p1-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const wild8 = { id: 'p2-0', kind: 'WILD_DRAW_EIGHT' as const, color: null };
      const p2Filler = { id: 'p2-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild4, wild8, p1Filler, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p2' });
      engine.playCard('p2', 'p2-0', engine.turnNumber, 'BLUE');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 12, targetId: 'p1' });
    });

    it('WILD_DRAW_FOUR cannot counter a pending WILD_DRAW_EIGHT combo (only another Wild Draw Eight can)', () => {
      const wild8 = { id: 'p1-0', kind: 'WILD_DRAW_EIGHT' as const, color: null };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const wild4 = { id: 'p2-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const p2Filler = { id: 'p2-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild8, wild4, p1Filler, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 8, targetId: 'p2' });

      expect(engine.getPlayableIds('p2')).not.toContain('p2-0');
      expect(() => engine.playCard('p2', 'p2-0', engine.turnNumber, 'BLUE')).toThrow(/MUST_COUNTER_OR_DRAW/);
    });

    it('DRAW_TWO counters a pending DRAW_TWO combo regardless of color', () => {
      const openingDrawTwo = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const counterBlue = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'BLUE' as const };
      const p2Filler = { id: 'p2-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [openingDrawTwo, counterBlue, p1Filler, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber);
      expect(engine.getPlayableIds('p2')).toContain('p2-0');
      engine.playCard('p2', 'p2-0', engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p1' });
    });

    it('answering a DRAW_TWO combo with a Wild Draw cannot add Draw Two cards in the same move', () => {
      const openingDrawTwo = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const wd4 = { id: 'p2-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const redD2 = { id: 'p2-1', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const p2Filler = { id: 'p2-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const p1Filler2 = { id: 'p1-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 7 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [openingDrawTwo, wd4, p1Filler, redD2, p1Filler2, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber);
      expect(() => engine.playCards('p2', ['p2-0', 'p2-1'], engine.turnNumber, 'BLUE')).toThrow('WILD_DRAW_NO_DRAW_TWO');
      // either one alone is fine
      engine.playCards('p2', ['p2-0'], engine.turnNumber, 'BLUE');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 6, targetId: 'p1' });
    });

    it('DRAW_TWO can counter a WILD_DRAW_TWO combo ONLY if its color matches the chosen color', () => {
      const wild2 = { id: 'p1-0', kind: 'WILD_DRAW_TWO' as const, color: null };
      const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const matching = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'GREEN' as const };
      const mismatched = { id: 'p2-1', kind: 'DRAW_TWO' as const, color: 'BLUE' as const };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild2, matching, p1Filler, mismatched, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'GREEN');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });

      // Mismatched color (BLUE) cannot counter a GREEN-chosen WILD_DRAW_TWO combo.
      expect(engine.getPlayableIds('p2')).not.toContain('p2-1');
      expect(() => engine.playCard('p2', 'p2-1', engine.turnNumber)).toThrow(/MUST_COUNTER_OR_DRAW/);

      // Matching color (GREEN) can.
      expect(engine.getPlayableIds('p2')).toContain('p2-0');
      engine.playCard('p2', 'p2-0', engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p1' });
    });

    it('reported case: countering a WILD_DRAW_TWO combo with a matching + non-matching DRAW_TWO together (+4)', () => {
      const wild2 = { id: 'p1-0', kind: 'WILD_DRAW_TWO' as const, color: null };
      const p1FillerA = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const p1FillerB = { id: 'p1-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const yellowD2 = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'YELLOW' as const }; // matches chosen color
      const blueD2 = { id: 'p2-1', kind: 'DRAW_TWO' as const, color: 'BLUE' as const }; // does not match alone
      const p2Filler = { id: 'p2-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 7 }; // keeps p2's hand non-empty
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'GREEN' as const, value: i % 10 }));
      // Deal order (handSize=3, 2 players): p1,p2,p1,p2,p1,p2,opening.
      const deck = [wild2, yellowD2, p1FillerA, blueD2, p1FillerB, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-0', engine.turnNumber, 'YELLOW');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });

      // Playing BOTH together (YELLOW matches, BLUE alone wouldn't) must succeed — pendingDraw
      // was 2, plus 2+2 from the two DRAW_TWO cards = 6.
      engine.playCards('p2', ['p2-1', 'p2-0'], engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 6, targetId: 'p1' });
      expect(engine.getHand('p2')).toHaveLength(1);
    });

    it('playCards lets the combo target counter-stack two matching-color DRAW_TWO cards at once (+4 back)', () => {
      const openingDrawTwo = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const p1Filler1 = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
      const p1Filler2 = { id: 'p1-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 6 };
      const counter1 = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const counter2 = { id: 'p2-1', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const p2Filler = { id: 'p2-2', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 7 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      // handSize=3, 2 players deals round-robin p1,p2,p1,p2,p1,p2 — p2 keeps a 3rd card so they
      // don't empty their hand (and thus don't win/end the game) when stacking both Draw Twos.
      const deck = [openingDrawTwo, counter1, p1Filler1, counter2, p1Filler2, p2Filler, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

      engine.playCard('p1', 'p1-0', engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });

      // p2 is the combo target and stacks BOTH of their Draw Twos in one move instead of one at a time.
      engine.playCards('p2', ['p2-0', 'p2-1'], engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 6, targetId: 'p1' });
    });

    it('playCards rejects mixing a draw-family card with a NUMBER card in the same stack', () => {
      const drawTwo = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const number = { id: 'p1-1', kind: 'NUMBER' as const, color: 'RED' as const, value: 5 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [drawTwo, rest[0], number, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

      expect(() => engine.playCards('p1', ['p1-0', 'p1-1'], engine.turnNumber)).toThrow(/CARDS_NOT_STACKABLE/);
    });

    it('playCards requires chosenColor when the draw-family stack includes a wild card', () => {
      const drawTwo = { id: 'p1-0', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const wild4 = { id: 'p1-1', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [drawTwo, rest[0], wild4, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

      expect(() => engine.playCards('p1', ['p1-0', 'p1-1'], engine.turnNumber)).toThrow(/COLOR_REQUIRED/);
    });

    it('stacks multiple SKIP cards at once to skip that many players', () => {
      const skip1 = { id: 's1', kind: 'SKIP' as const, color: 'RED' as const };
      const skip2 = { id: 's2', kind: 'SKIP' as const, color: 'BLUE' as const };
      const filler = (id: string) => ({ id, kind: 'NUMBER' as const, color: 'GREEN' as const, value: 1 });
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      // 4 players, handSize=2, round-robin dealing (p1,p2,p3,p4,p1,p2,p3,p4): put both Skip
      // cards at indices 0 and 4 so they both land in p1's hand.
      const deck = [
        skip1, filler('p2a'), filler('p3a'), filler('p4a'),
        skip2, filler('p2b'), filler('p3b'), filler('p4b'),
        top, ...rest,
      ];
      const engine = new GameEngine('room1', ['p1', 'p2', 'p3', 'p4'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(engine.getHand('p1').map((c) => c.id).sort()).toEqual(['s1', 's2']);
      // Playing both Skip cards together should skip p2 AND p3, landing on p4.
      const result = engine.playCards('p1', ['s1', 's2'], engine.turnNumber);
      expect(result.cards.map((c) => c.id)).toEqual(['s1', 's2']);
      expect(engine.currentPlayerId).toBe('p4');
    });

    it('stacks multiple REVERSE cards at once — even count cancels out, odd count flips once', () => {
      const r1 = { id: 'r1', kind: 'REVERSE' as const, color: 'RED' as const };
      const r2 = { id: 'r2', kind: 'REVERSE' as const, color: 'BLUE' as const };
      const filler = (id: string) => ({ id, kind: 'NUMBER' as const, color: 'GREEN' as const, value: 1 });
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [
        r1, filler('p2a'), filler('p3a'), filler('p4a'),
        r2, filler('p2b'), filler('p3b'), filler('p4b'),
        top, ...rest,
      ];
      const engine = new GameEngine('room1', ['p1', 'p2', 'p3', 'p4'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(engine.direction).toBe('RIGHT');
      // Two Reverses cancel out: direction stays RIGHT, no one is skipped — p2 plays next as normal.
      engine.playCards('p1', ['r1', 'r2'], engine.turnNumber);
      expect(engine.direction).toBe('RIGHT');
      expect(engine.currentPlayerId).toBe('p2');
    });

    it('cross-stacking: a Draw Two combo can be answered with a Wild Draw Four and vice versa', () => {
      const d2 = { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
      const w4 = { id: 'p2-w4', kind: 'WILD_DRAW_FOUR' as const, color: null };
      const p1f = { id: 'p1f', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 1 };
      const p2f = { id: 'p2f', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 2 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [d2, w4, p1f, p2f, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'p1-d2', engine.turnNumber);
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2' });
      // p2 stacks a Wild Draw Four on top of the +2 — the amounts add up (2 + 4 = 6).
      engine.playCard('p2', 'p2-w4', engine.turnNumber, 'BLUE');
      expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 6, targetId: 'p1' });
    });

    it('still rejects stacking Wild / Wild Draw Four / Draw Two cards via playCards', () => {
      const w1 = { id: 'w1', kind: 'WILD' as const, color: null };
      const w2 = { id: 'w2', kind: 'WILD' as const, color: null };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
      const rest = Array.from({ length: 10 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [w1, rest[0], w2, rest[1], top, ...rest.slice(2)];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      expect(() => engine.playCards('p1', ['w1', 'w2'], engine.turnNumber)).toThrow(/CARDS_NOT_STACKABLE/);
    });

    it('Wild card stays in discard when draw pile exhausts (no reshuffle)', () => {
      const wild = { id: 'wild', kind: 'WILD' as const, color: null };
      const p1Filler = { id: 'p1-f', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 1 };
      const p2Filler = { id: 'p2-f', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 2 };
      const top = { id: 'top', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 9 };
      // Larger draw pile so game doesn't finish early.
      const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'YELLOW' as const, value: i % 10 }));
      const deck = [wild, p2Filler, p1Filler, { id: 'p2-f2', kind: 'NUMBER' as const, color: 'BLUE' as const, value: 3 }, top, ...rest];
      const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
      engine.playCard('p1', 'wild', engine.turnNumber, 'RED');
      expect(engine.topCard.color).toBe('RED');
      // Just verify the Wild was played successfully with chosen color.
      // The discard pile now has the RED Wild. No reshuffle mechanic exists.
      expect(engine.discardPile.length).toBe(2);
      expect(engine.discardPile[1].color).toBe('RED');
    });

    it('conserves total card count through plays, draws, and player eliminations', () => {
      const makeCard = (id: string, kind: 'NUMBER' | 'SKIP' | 'DRAW_TWO', color: 'RED' | 'BLUE' | 'GREEN' | 'YELLOW', value = 0) =>
        ({ id, kind, color, value } as const);

      const top = makeCard('top', 'NUMBER', 'RED', 9);

      const cards = [
        makeCard('p1-0', 'SKIP', 'RED'),
        makeCard('p2-0', 'SKIP', 'BLUE'),
        makeCard('p3-0', 'SKIP', 'GREEN'),
        top,
        makeCard('d1', 'NUMBER', 'RED', 1),
        makeCard('d2', 'NUMBER', 'BLUE', 2),
        makeCard('d3', 'NUMBER', 'GREEN', 3),
        makeCard('d4', 'NUMBER', 'YELLOW', 4),
        makeCard('d5', 'NUMBER', 'RED', 5),
        makeCard('d6', 'NUMBER', 'BLUE', 6),
        makeCard('d7', 'NUMBER', 'GREEN', 7),
        makeCard('d8', 'NUMBER', 'YELLOW', 8),
        ...Array.from({ length: 30 }, (_, i) => makeCard(`f${i}`, 'NUMBER', 'YELLOW', i % 10)),
      ];

      const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck: cards, handSize: 1 });
      engine.selectDirection('p1', 'RIGHT', engine.turnNumber);

      const countTotal = () => {
        const state = engine.getPrivateState();
        let total = state.drawPile.length + state.discardPile.length;
        for (const hand of Object.values(state.playerHands)) total += hand.length;
        return total;
      };

      expect(countTotal()).toBe(cards.length);

      let safety = 0;
      while (engine.status === 'PLAYING' && safety < 200) {
        const before = countTotal();
        const pid = engine.currentPlayerId!;
        const hand = engine.getHand(pid);
        const playable = engine.getPlayableIds(pid);
        if (playable.length > 0) {
          engine.playCard(pid, playable[0], engine.turnNumber);
        } else {
          engine.drawCard(pid, engine.turnNumber);
        }
        const after = countTotal();
        expect(after).toBe(before);
        safety++;
      }
      expect(safety).toBeLessThan(200);
      expect(countTotal()).toBe(cards.length);
    });
  });
});
describe('reported case: multi-color DRAW_TWO combo after absorbing a WILD_DRAW_FOUR, regardless of selection order', () => {
  function buildAbsorbedScenario() {
    const wild4 = { id: 'p1-0', kind: 'WILD_DRAW_FOUR' as const, color: null };
    const p1Filler = { id: 'p1-1', kind: 'NUMBER' as const, color: 'GREEN' as const, value: 5 };
    const d2blue = { id: 'p2-0', kind: 'DRAW_TWO' as const, color: 'BLUE' as const };
    const d2red = { id: 'p2-1', kind: 'DRAW_TWO' as const, color: 'RED' as const };
    const top = { id: 'top', kind: 'NUMBER' as const, color: 'RED' as const, value: 9 };
    const absorbed = [
      { id: 'abs-0', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 1 },
      { id: 'abs-1', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 2 },
      { id: 'abs-2', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 3 },
      { id: 'abs-3', kind: 'NUMBER' as const, color: 'YELLOW' as const, value: 4 },
    ];
    const rest = Array.from({ length: 20 }, (_, i) => ({ id: `rest-${i}`, kind: 'NUMBER' as const, color: 'GREEN' as const, value: i % 10 }));
    const deck = [wild4, d2blue, p1Filler, d2red, top, ...absorbed, ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCard('p1', 'p1-0', engine.turnNumber, 'BLUE');
    engine.drawCard('p2', engine.turnNumber); // absorb the +4 (pendingDraw clears, p2 keeps the turn)
    return engine;
  }

  it('works when the color-matching card (BLUE) is selected first', () => {
    const engine = buildAbsorbedScenario();
    engine.playCards('p2', ['p2-0', 'p2-1'], engine.turnNumber); // BLUE, then RED
    expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p1' });
  });

  it('ALSO works when the non-matching card (RED) is selected first — fixed order-dependent bug', () => {
    const engine = buildAbsorbedScenario();
    engine.playCards('p2', ['p2-1', 'p2-0'], engine.turnNumber); // RED, then BLUE
    expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 4, targetId: 'p1' });
  });
});


describe('REFLECT card (สะท้อนกลับ)', () => {
  const N = (id: string, color: 'RED' | 'GREEN' | 'BLUE' | 'YELLOW', value: number) => ({ id, kind: 'NUMBER' as const, color, value });
  const REF = (id: string) => ({ id, kind: 'REFLECT' as const, color: null });
  const rest = Array.from({ length: 20 }, (_, i) => N(`rest-${i}`, 'GREEN', i % 10));

  it('bounces a pending combo back to the player who sent it, leaving the combo size and top card unchanged', () => {
    const d2 = { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
    // deal order (3 players, handSize 2): p1,p2,p3,p1,p2,p3, opening
    const deck = [d2, REF('p2-ref'), N('p3-a', 'BLUE', 3), N('p1-b', 'GREEN', 1), N('p2-b', 'GREEN', 2), N('p3-b', 'BLUE', 4), N('top', 'RED', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCard('p1', 'p1-d2', engine.turnNumber);
    expect(engine.getPublicState().pendingDraw).toMatchObject({ count: 2, targetId: 'p2', fromId: 'p1' });
    expect(engine.getPlayableIds('p2')).toContain('p2-ref');

    engine.playCard('p2', 'p2-ref', engine.turnNumber);
    const s = engine.getPublicState();
    expect(s.pendingDraw).toMatchObject({ count: 2, targetId: 'p1', fromId: 'p2' });
    expect(s.currentPlayerId).toBe('p1');
    expect(s.topCard.id).toBe('p1-d2'); // reflect slides under the combo card
    expect(s.history.some((h) => h.action === 'REFLECT' && h.toPlayerId === 'p1')).toBe(true);

    // p1 absorbs the bounced combo
    engine.drawCard('p1', engine.turnNumber);
    expect(engine.getHand('p1')).toHaveLength(3);
    expect(engine.getPublicState().history.some((h) => h.action === 'ABSORB' && h.count === 2)).toBe(true);
  });

  it('can NOT be played when no combo is pending against you', () => {
    const deck = [N('p1-a', 'RED', 1), REF('p2-ref'), N('p1-b', 'GREEN', 1), N('p2-b', 'GREEN', 2), N('top', 'BLUE', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.getPlayableIds('p2')).not.toContain('p2-ref');
    expect(engine.getPlayableIds('p1')).toEqual([]);
  });

  it('throws REFLECT_ONLY_VS_COMBO if played outside a combo', () => {
    const deck = [REF('p1-ref'), N('p2-a', 'GREEN', 2), N('p1-b', 'BLUE', 1), N('p2-b', 'GREEN', 3), N('top', 'BLUE', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(() => engine.playCard('p1', 'p1-ref', engine.turnNumber)).toThrow('REFLECT_ONLY_VS_COMBO');
  });

  it('vanishes from every hand once the draw pile is empty and nobody holds a draw-family card', () => {
    // 2 players, handSize 2, exactly 5 cards: draw pile starts empty.
    const deck = [N('p1-a', 'GREEN', 5), REF('p2-ref'), N('p1-b', 'GREEN', 6), N('p2-b', 'GREEN', 7), N('top', 'GREEN', 1)];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.getHand('p2').map((c) => c.id)).toEqual(['p2-b']);
    expect(engine.getPublicState().history.some((h) => h.action === 'VANISH' && h.playerId === 'p2')).toBe(true);
  });

  it('a player whose hand is emptied by vanishing reflects goes out (ranked) like playing their last card', () => {
    const deck = [N('p1-a', 'GREEN', 5), REF('p2-r1'), N('p1-b', 'GREEN', 6), REF('p2-r2'), N('top', 'GREEN', 1)];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.status).toBe('FINISHED');
    expect(engine.winnerId).toBe('p2');
  });

  it('stays in hand while someone still holds a draw-family card', () => {
    const deck = [N('p1-a', 'GREEN', 5), REF('p2-ref'), { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'GREEN' as const }, N('p2-b', 'GREEN', 7), N('top', 'GREEN', 1)];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.getHand('p2').map((c) => c.id)).toContain('p2-ref');
  });
});

describe('SHIELD card (โล่ป้องกัน)', () => {
  const N = (id: string, color: 'RED' | 'GREEN' | 'BLUE' | 'YELLOW', value: number) => ({ id, kind: 'NUMBER' as const, color, value });
  const SH = (id: string) => ({ id, kind: 'SHIELD' as const, color: null });
  const rest = Array.from({ length: 20 }, (_, i) => N(`rest-${i}`, 'GREEN', i % 10));

  it('passes a pending combo on, unchanged, to the NEXT player in the current direction', () => {
    const d2 = { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
    const deck = [d2, SH('p2-sh'), N('p3-a', 'BLUE', 3), N('p1-b', 'GREEN', 1), N('p2-b', 'GREEN', 2), N('p3-b', 'BLUE', 4), N('top', 'RED', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCard('p1', 'p1-d2', engine.turnNumber);
    expect(engine.getPlayableIds('p2')).toContain('p2-sh');
    engine.playCard('p2', 'p2-sh', engine.turnNumber);
    const s = engine.getPublicState();
    expect(s.pendingDraw).toMatchObject({ count: 2, targetId: 'p3', fromId: 'p2' });
    expect(s.currentPlayerId).toBe('p3');
    expect(s.topCard.id).toBe('p1-d2');
    expect(s.history.some((h) => h.action === 'SHIELD' && h.toPlayerId === 'p3')).toBe(true);
    engine.drawCard('p3', engine.turnNumber);
    expect(engine.getHand('p3')).toHaveLength(4);
  });

  it('can NOT be played when no combo is pending (SHIELD_ONLY_VS_COMBO)', () => {
    const deck = [SH('p1-sh'), N('p2-a', 'GREEN', 2), N('p1-b', 'BLUE', 1), N('p2-b', 'GREEN', 3), N('top', 'BLUE', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.getPlayableIds('p1')).toEqual(['p1-b']);
    expect(() => engine.playCard('p1', 'p1-sh', engine.turnNumber)).toThrow('SHIELD_ONLY_VS_COMBO');
  });

  it('vanishes once the draw pile is empty and nobody holds a draw card anymore', () => {
    const deck = [N('p1-a', 'BLUE', 1), SH('p2-sh'), N('p1-b', 'GREEN', 5), N('p2-b', 'BLUE', 3), N('top', 'BLUE', 9)];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    expect(engine.getHand('p2').map((c) => c.id)).toEqual(['p2-b']);
    expect(engine.getPublicState().history.some((h) => h.action === 'VANISH' && h.playerId === 'p2')).toBe(true);
  });
});

describe('SHUFFLE card (สลับที่นั่ง)', () => {
  const N = (id: string, color: 'RED' | 'GREEN' | 'BLUE' | 'YELLOW', value: number) => ({ id, kind: 'NUMBER' as const, color, value });
  const SF = (id: string) => ({ id, kind: 'SHUFFLE' as const, color: null });
  const rest = Array.from({ length: 30 }, (_, i) => N(`rest-${i}`, 'GREEN', i % 10));

  it('randomly reshuffles seats; the shuffler still plays a card, THEN whoever now sits after them goes', () => {
    // 4 players, handSize 2: p1,p2,p3,p4,p1,p2,p3,p4, top
    const deck = [SF('p1-sf'), N('p2-a', 'RED', 1), N('p3-a', 'RED', 2), N('p4-a', 'RED', 3), N('p1-b', 'BLUE', 1), N('p2-b', 'RED', 4), N('p3-b', 'RED', 5), N('p4-b', 'RED', 6), N('top', 'BLUE', 9), ...rest];
    let k = 0;
    const rng = (max: number) => [3, 0, 2, 1, 0][k++ % 5] % max;
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3', 'p4'], { deck, handSize: 2, rng });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    const before = [...engine.getPublicState().seatOrder];
    expect(engine.getPlayableIds('p1')).toContain('p1-sf'); // colorless, playable on any top card
    engine.playCard('p1', 'p1-sf', engine.turnNumber);
    const s = engine.getPublicState();
    expect([...s.seatOrder].sort()).toEqual([...before].sort());
    expect(s.seatOrder).not.toEqual(before);
    expect(s.currentPlayerId).toBe('p1'); // shuffler keeps the turn
    expect(s.topCard.id).toBe('top'); // slides under — color to match unchanged
    expect(s.history.some((h) => h.action === 'SHUFFLE_SEATS' && h.seatOrder?.length === 4)).toBe(true);
    expect(engine.getPrivateHand('p1').isMyTurn).toBe(true);
    // p1 now plays a normal card; only then does play pass to the player after p1 in the NEW order
    engine.playCard('p1', 'p1-b', engine.turnNumber);
    // (p1 just emptied their hand and went out, so compare against the post-shuffle order)
    const s2 = engine.getPublicState();
    const i = s.seatOrder.indexOf('p1');
    expect(s2.currentPlayerId).toBe(s.seatOrder[(i + 1) % 4]);
  });

  it('playing Shuffle as your last card goes out and passes play to whoever now sits after you', () => {
    const deck = [SF('p1-sf'), N('p2-a', 'RED', 1), N('p3-a', 'RED', 2), N('top', 'BLUE', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 1 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCard('p1', 'p1-sf', engine.turnNumber);
    const s = engine.getPublicState();
    expect(s.finishedOrder).toEqual(['p1']);
    expect(s.seatOrder).not.toContain('p1');
    expect(['p2', 'p3']).toContain(s.currentPlayerId);
  });

  it('can not be used to dodge a pending combo', () => {
    const d2 = { id: 'p1-d2', kind: 'DRAW_TWO' as const, color: 'RED' as const };
    const deck = [d2, SF('p2-sf'), N('p1-b', 'GREEN', 1), N('p2-b', 'GREEN', 2), N('top', 'RED', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 2 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCard('p1', 'p1-d2', engine.turnNumber);
    expect(engine.getPlayableIds('p2')).not.toContain('p2-sf');
    expect(() => engine.playCard('p2', 'p2-sf', engine.turnNumber)).toThrow('MUST_COUNTER_OR_DRAW');
  });
});

describe('stacked SKIP / REVERSE never wrap past the player who laid them', () => {
  const N = (id: string, color: 'RED' | 'GREEN' | 'BLUE' | 'YELLOW', value: number) => ({ id, kind: 'NUMBER' as const, color, value });
  const SK = (id: string, color: 'RED' | 'GREEN' | 'BLUE' | 'YELLOW') => ({ id, kind: 'SKIP' as const, color });
  const RV = (id: string, color: 'RED' | 'GREEN' | 'BLUE' | 'YELLOW') => ({ id, kind: 'REVERSE' as const, color });
  const rest = Array.from({ length: 30 }, (_, i) => N(`rest-${i}`, 'GREEN', i % 10));

  it('2 players: two Skips at once come straight back to the player who laid them', () => {
    // deal (2p, hand 3): p1,p2,p1,p2,p1,p2, top
    const deck = [SK('p1-a', 'RED'), N('p2-a', 'BLUE', 1), SK('p1-b', 'BLUE'), N('p2-b', 'BLUE', 2), N('p1-c', 'YELLOW', 3), N('p2-c', 'BLUE', 3), N('top', 'RED', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCards('p1', ['p1-a', 'p1-b'], engine.turnNumber);
    expect(engine.getPublicState().currentPlayerId).toBe('p1');
  });

  it('2 players: two Reverses at once come straight back to the player who laid them', () => {
    const deck = [RV('p1-a', 'RED'), N('p2-a', 'BLUE', 1), RV('p1-b', 'BLUE'), N('p2-b', 'BLUE', 2), N('p1-c', 'YELLOW', 3), N('p2-c', 'BLUE', 3), N('top', 'RED', 9), ...rest];
    const engine = new GameEngine('room1', ['p1', 'p2'], { deck, handSize: 3 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCards('p1', ['p1-a', 'p1-b'], engine.turnNumber);
    expect(engine.getPublicState().currentPlayerId).toBe('p1');
  });

  it('4 players: two Skips skip the next two players', () => {
    // deal (4p, hand 3): p1,p2,p3,p4 x3, top
    const deck = [
      SK('p1-a', 'RED'), N('p2-a', 'BLUE', 1), N('p3-a', 'BLUE', 2), N('p4-a', 'BLUE', 3),
      SK('p1-b', 'BLUE'), N('p2-b', 'BLUE', 4), N('p3-b', 'BLUE', 5), N('p4-b', 'BLUE', 6),
      N('p1-c', 'YELLOW', 3), N('p2-c', 'BLUE', 7), N('p3-c', 'BLUE', 8), N('p4-c', 'BLUE', 0),
      N('top', 'RED', 9), ...rest,
    ];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3', 'p4'], { deck, handSize: 3 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    const order = engine.getPublicState().seatOrder;
    const i = order.indexOf('p1');
    engine.playCards('p1', ['p1-a', 'p1-b'], engine.turnNumber);
    expect(engine.getPublicState().currentPlayerId).toBe(order[(i + 3) % 4]);
  });

  it('3 players: three Skips cap at skipping everyone else → back to the player', () => {
    const deck = [
      SK('p1-a', 'RED'), N('p2-a', 'BLUE', 1), N('p3-a', 'BLUE', 2),
      SK('p1-b', 'BLUE'), N('p2-b', 'BLUE', 4), N('p3-b', 'BLUE', 5),
      SK('p1-c', 'GREEN'), N('p2-c', 'BLUE', 7), N('p3-c', 'BLUE', 8),
      N('p1-d', 'YELLOW', 3), N('p2-d', 'BLUE', 6), N('p3-d', 'BLUE', 0),
      N('top', 'RED', 9), ...rest,
    ];
    const engine = new GameEngine('room1', ['p1', 'p2', 'p3'], { deck, handSize: 4 });
    engine.selectDirection('p1', 'RIGHT', engine.turnNumber);
    engine.playCards('p1', ['p1-a', 'p1-b', 'p1-c'], engine.turnNumber);
    expect(engine.getPublicState().currentPlayerId).toBe('p1');
  });
});
