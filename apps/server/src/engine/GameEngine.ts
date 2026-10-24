import { randomUUID } from 'node:crypto';
import {
  COLORS,
  HAND_SIZE,
  MIN_PLAYERS,
  canPlayCard,
  isWild,
  nextSeatIndex,
  type Card,
  type CardColor,
  type Direction,
  type FinishReason,
  type GameResult,
  type GameState,
  type GameStatus,
  type HistoryEntry,
  type PrivateHand,
} from '@cma/shared';
import { createDeck, cryptoRng, shuffle, type Rng } from './deck';

/** DRAW_TWO / WILD_DRAW_TWO / WILD_DRAW_FOUR / WILD_DRAW_EIGHT — any mix of these can be
 * stacked together in one combo, cross-stacking into a single growing draw count. */
const DRAW_FAMILY_KINDS = new Set<Card['kind']>(['DRAW_TWO', 'WILD_DRAW_TWO', 'WILD_DRAW_FOUR', 'WILD_DRAW_EIGHT']);

/** How many cards a single draw-family card adds to a combo. */
function drawAmountFor(kind: Card['kind']): number {
  if (kind === 'WILD_DRAW_EIGHT') return 8;
  if (kind === 'WILD_DRAW_FOUR') return 4;
  return 2; // DRAW_TWO / WILD_DRAW_TWO
}

/** Wild Draw cards (choose a new color) — can stack onto a pending combo, but ONLY if their own
 * tier (drawAmountFor) is >= the current top card's tier: Wild Draw Four or Eight can counter a
 * Wild Draw Two combo, but Wild Draw Two can NOT counter a Wild Draw Four/Eight combo — once the
 * combo escalates to a stronger Wild Draw, only that tier or higher can answer it. */
function isWildDrawKind(kind: Card['kind']): boolean {
  return kind === 'WILD_DRAW_TWO' || kind === 'WILD_DRAW_FOUR' || kind === 'WILD_DRAW_EIGHT';
}

/**
 * Can `card` legally be stacked to counter/extend the pending combo currently topped by
 * `topCard`?
 *  - A plain DRAW_TWO countering a combo started/last-extended by another plain DRAW_TWO: any
 *    color, no color-matching requirement.
 *  - A plain DRAW_TWO countering a combo started/last-extended by WILD_DRAW_TWO: must match the
 *    color that was explicitly CHOSEN for that Wild Draw Two.
 *  - A plain DRAW_TWO can never counter a WILD_DRAW_FOUR/EIGHT combo, regardless of color.
 *  - A Wild Draw card (Two/Four/Eight) counters any combo whose tier is <= its own tier — e.g.
 *    Wild Draw Four or Eight can answer a Wild Draw Two combo, but Wild Draw Two cannot answer a
 *    Wild Draw Four/Eight combo; Wild Draw Eight can only be answered by another Wild Draw Eight.
 */
function canCounterCombo(card: Card, topCard: Card): boolean {
  if (card.kind === 'DRAW_TWO') {
    // Draw Two on Draw Two: any color. Draw Two on a Wild Draw Two: must match the chosen color.
    if (topCard.kind === 'DRAW_TWO') return true;
    if (topCard.kind === 'WILD_DRAW_TWO') return card.color === topCard.color;
    return false;
  }
  if (isWildDrawKind(card.kind)) {
    return drawAmountFor(card.kind) >= drawAmountFor(topCard.kind);
  }
  return false;
}


export class GameError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'GameError';
  }
}

export interface EngineOptions {
  deck?: Card[];
  rng?: Rng;
  handSize?: number;
  now?: () => number;
}

export interface ServerPrivateState {
  playerHands: Record<string, Card[]>;
  drawPile: Card[];
  discardPile: Card[];
  shuffledDeck: Card[];
}

export class GameEngine {
  readonly gameId = randomUUID();
  status: GameStatus = 'CHOOSING_DIRECTION';
  direction: Direction | null = null;
  turnNumber = 1;
  winnerId: string | null = null;
  finishReason: FinishReason | null = null;
  firstPlayerId: string;
  readonly startedAt: number;
  endedAt: number | null = null;

  private seatOrder: string[];
  private currentIndex = 0;
  private readonly hands = new Map<string, Card[]>();
  private drawPile: Card[] = [];
  private discardPile: Card[] = [];
  private readonly shuffledDeck: Card[];
  private readonly cardsDrawn: Record<string, number> = {};
  private history: HistoryEntry[] = [];
  private seq = 0;
  private consecutiveSkips = 0;
  private readonly rng: Rng;
  private readonly now: () => number;
  /** Active +2/+4 combo awaiting a response from `targetId`: stack another Draw card to pass it
   * on (with the amount added on top), or draw the whole accumulated count and end the turn. */
  private pendingDraw: { count: number; targetId: string; fromId: string | null } | null = null;
  /** Players who have emptied their hand, in the order they did so — rank 1 is index 0. The
   * game keeps going for whoever's left until only one player still holds cards. */
  private finishedOrder: string[] = [];

  constructor(readonly roomId: string, playerIds: string[], opts: EngineOptions = {}) {
    if (playerIds.length < MIN_PLAYERS) throw new GameError('NOT_ENOUGH_PLAYERS');
    if (new Set(playerIds).size !== playerIds.length) throw new GameError('DUPLICATE_PLAYER');
    this.rng = opts.rng ?? cryptoRng;
    this.now = opts.now ?? Date.now;
    const handSize = opts.handSize ?? HAND_SIZE;

    // Unlimited room size: add extra full decks whenever one deck can't comfortably deal everyone
    // (keep at least ~40% of the cards for the draw pile).
    const deckCount = Math.max(1, Math.ceil((playerIds.length * handSize) / (createDeck().length * 0.6)));
    const deck = opts.deck ? [...opts.deck] : shuffle(Array.from({ length: deckCount }, () => createDeck()).flat(), this.rng);
    if (deck.length < playerIds.length * handSize + 1) throw new GameError('DECK_TOO_SMALL');
    this.shuffledDeck = [...deck];
    this.seatOrder = [...playerIds];
    this.firstPlayerId = playerIds[0];

    for (const id of playerIds) {
      this.hands.set(id, []);
      this.cardsDrawn[id] = 0;
    }
    let k = 0;
    for (let r = 0; r < handSize; r++) for (const id of playerIds) this.hands.get(id)!.push(deck[k++]);
    // Opening discard must be a plain NUMBER card — never an Action or Wild card, which would
    // either trigger a confusing effect before anyone has even taken a turn or (for Wild) have no
    // color to match against. Skip past any non-NUMBER cards drawn for the flip and put them back
    // into the draw pile instead.
    let openIdx = k;
    while (openIdx < deck.length && deck[openIdx].kind !== 'NUMBER') openIdx++;
    if (openIdx >= deck.length) throw new GameError('DECK_TOO_SMALL');
    const opening = deck[openIdx];
    this.discardPile.push(opening);
    const skippedNonNumber = deck.slice(k, openIdx);
    const remaining = deck.slice(openIdx + 1);
    this.drawPile = [...remaining, ...skippedNonNumber].reverse();
    this.startedAt = this.now();
  }

  // Queries
  get players(): readonly string[] { return this.seatOrder; }
  get currentPlayerId(): string | null {
    return this.status === 'FINISHED' ? null : this.seatOrder[this.currentIndex] ?? null;
  }
  get topCard(): Card { return this.discardPile[this.discardPile.length - 1]; }
  isInGame(playerId: string) { return this.hands.has(playerId); }
  getHand(playerId: string): Card[] { return [...(this.hands.get(playerId) ?? [])]; }

  getCardCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, hand] of this.hands) out[id] = hand.length;
    return out;
  }

  /**
   * All Wild-family cards (plain Wild, and Wild Draw Two/Four/Eight) are always playable
   * regardless of hand contents — no "must have no color match" restriction. Players may freely
   * open or continue with a Wild Draw card any time it's their turn.
   *
   * Exception: while a +2/+4/+8 combo is pending against this player, legal plays are:
   * - Any Wild Draw card (WILD_DRAW_TWO / WILD_DRAW_FOUR / WILD_DRAW_EIGHT) — they choose a new color
   * - DRAW_TWO cards that match the chosen color on the top card (the color selected by the
   *   player who started/extended the combo)
   * Normal color/value matching doesn't apply to other card kinds, since this isn't a normal
   * play against the top card.
   */
  getPlayableIds(playerId: string): string[] {
    const hand = this.hands.get(playerId) ?? [];
    if (this.pendingDraw?.targetId === playerId) {
      const top = this.topCard;
      return hand
        .filter((c) => c.kind === 'REFLECT' || c.kind === 'SHIELD' || c.kind === 'SHUFFLE' || (DRAW_FAMILY_KINDS.has(c.kind) && canCounterCombo(c, top)))
        .map((c) => c.id);
    }
    const top = this.topCard;
    return hand.filter((c) => canPlayCard(c, top)).map((c) => c.id);
  }

  getPrivateHand(playerId: string): PrivateHand {
    const isMyTurn = this.currentPlayerId === playerId;
    const playable = this.getPlayableIds(playerId);
    const hand = this.getHand(playerId);
    const mustRespondToDraw = this.pendingDraw?.targetId === playerId;

    // Determine if the ONLY playable cards are wild cards (plain Wild + Wild Draw Two/Four/Eight).
    // If so, the player MAY choose to draw instead of playing a wild card.
    // If there are ANY other playable cards (color/number match, Skip, Reverse, Draw Two),
    // drawing is NOT allowed (must play).
    const WILD_KINDS_SET = new Set(['WILD', 'WILD_DRAW_TWO', 'WILD_DRAW_FOUR', 'WILD_DRAW_EIGHT']);
    const onlyWildPlayable = playable.length > 0 &&
      playable.every((id) => WILD_KINDS_SET.has(hand.find((c) => c.id === id)?.kind ?? ''));

    // Can something actually be drawn right now? Either the draw pile still has cards, or — once
    // it's empty — there's still at least one other player holding cards to steal from.
    const canDrawSomething = this.drawPile.length > 0 || this.nextDonorFrom(playerId) !== null;

    const canDraw = isMyTurn && this.status === 'PLAYING' && (
      mustRespondToDraw ||
      (playable.length === 0 && canDrawSomething) ||
      (onlyWildPlayable && canDrawSomething)
    );

    return {
      hand,
      playableCardIds: playable,
      canDraw,
      canDrawInsteadOfWild: onlyWildPlayable && !mustRespondToDraw,
      isMyTurn,
    };
  }

  getPublicState(): GameState {
    return {
      roomId: this.roomId,
      gameId: this.gameId,
      gameStatus: this.status,
      currentPlayerId: this.currentPlayerId,
      firstPlayerId: this.firstPlayerId,
      direction: this.direction,
      directionSelected: this.direction !== null,
      topCard: this.topCard,
      drawPileCount: this.drawPile.length,
      discardPile: this.discardPile.slice(-8),
      discardCount: this.discardPile.length,
      turnNumber: this.turnNumber,
      winnerId: this.winnerId,
      seatOrder: [...this.seatOrder],
      cardCounts: this.getCardCounts(),
      history: this.history.slice(-40),
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      pendingDraw: this.pendingDraw ? { ...this.pendingDraw } : null,
      finishedOrder: [...this.finishedOrder],
    };
  }

  getPrivateState(): ServerPrivateState {
    const playerHands: Record<string, Card[]> = {};
    for (const [id, h] of this.hands) playerHands[id] = [...h];
    return { playerHands, drawPile: [...this.drawPile], discardPile: [...this.discardPile], shuffledDeck: [...this.shuffledDeck] };
  }

  getResult(nicknames: Map<string, string>): GameResult {
    // Rank by the order players actually went out (rank 1 = first to empty their hand).
    // Anyone still holding cards when the game ends (normally just the last player standing)
    // is ranked after all finishers, worst-hand-first as a tiebreak.
    const finishedSet = new Set(this.finishedOrder);
    const stillIn = [...this.seatOrder].sort(
      (a, b) => (this.hands.get(a)?.length ?? 0) - (this.hands.get(b)?.length ?? 0),
    );
    const orderedIds = [...this.finishedOrder, ...stillIn.filter((id) => !finishedSet.has(id))];
    const ranking = orderedIds
      .map((id, i) => ({
        playerId: id,
        nickname: nicknames.get(id) ?? '?',
        cardsLeft: this.hands.get(id)?.length ?? 0,
        cardsDrawn: this.cardsDrawn[id] ?? 0,
        rank: i + 1,
      }));
    const endedAt = this.endedAt ?? this.now();
    return {
      gameId: this.gameId,
      winnerId: this.winnerId,
      reason: this.finishReason ?? 'EMPTY_HAND',
      ranking,
      turns: this.turnNumber,
      durationMs: endedAt - this.startedAt,
      totalCardsDrawn: Object.values(this.cardsDrawn).reduce((a, b) => a + b, 0),
      startedAt: this.startedAt,
      endedAt,
    };
  }

  // Commands
  selectDirection(playerId: string, direction: Direction, turnNumber: number) {
    this.assertTurn(playerId, turnNumber, 'CHOOSING_DIRECTION');
    this.direction = direction;
    this.status = 'PLAYING';
    this.log({ turnNumber, playerId, action: 'DIRECTION', direction });
    this.resolveStuckPlayers();
  }

  /**
   * Play one card. `chosenColor` is REQUIRED for WILD / WILD_DRAW_FOUR (the
   * color the player picks becomes the card's resolved color on the discard
   * pile) and ignored for every other kind.
   *
   * Action effects (applied after the card lands, before the next player's
   * turn begins):
   *  - SKIP: the next player's turn is skipped entirely.
   *  - REVERSE: direction flips (3+ players); with exactly 2 players this
   *    has no distinct seat to reverse into, so it acts like SKIP instead —
   *    the same outcome as real UNO.
   *  - DRAW_TWO / WILD_DRAW_FOUR: starts (or extends) a pending combo on the
   *    next player — they must either stack their own Draw Two / Wild Draw
   *    Four on top (passing the growing total further along) or call
   *    drawCard() to absorb the whole accumulated count and end their turn.
   */
  playCard(playerId: string, cardId: string, turnNumber: number, chosenColor?: CardColor): { card: Card; finished: boolean } {
    this.assertTurn(playerId, turnNumber, 'PLAYING');
    const hand = this.hands.get(playerId)!;
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new GameError('CARD_NOT_IN_HAND');
    const card = hand[idx];

    const defendingCombo = this.pendingDraw?.targetId === playerId;
    if (card.kind === 'REFLECT') {
      if (!defendingCombo) throw new GameError('REFLECT_ONLY_VS_COMBO');
      return this.playReflect(playerId, idx, turnNumber);
    }
    if (card.kind === 'SHIELD') {
      if (!defendingCombo) throw new GameError('SHIELD_ONLY_VS_COMBO');
      return this.playShield(playerId, idx, turnNumber);
    }
    if (card.kind === 'SHUFFLE') {
      // Playable any time it's your turn — even with a combo pending (the combo stays on you).
      return this.playShuffleSeats(playerId, idx, turnNumber);
    }
    if (defendingCombo) {
      // Responding to a pending +2/+4/+8 combo: only a draw-family card that passes
      // canCounterCombo() is legal — Wild Draw cards need tier >= the combo's current tier,
      // and a plain DRAW_TWO needs the combo still at tier 2 AND a matching color.
      if (!DRAW_FAMILY_KINDS.has(card.kind) || !canCounterCombo(card, this.topCard)) {
        throw new GameError('MUST_COUNTER_OR_DRAW');
      }
    } else {
      if (!canPlayCard(card, this.topCard)) throw new GameError('CARD_NOT_PLAYABLE');
    }
    if (isWild(card) && !chosenColor) throw new GameError('COLOR_REQUIRED');
    if (chosenColor && !COLORS.includes(chosenColor)) throw new GameError('INVALID_COLOR');

    hand.splice(idx, 1);
    const placedCard: Card = isWild(card) ? { ...card, color: chosenColor! } : card;
    this.discardPile.push(placedCard);
    this.consecutiveSkips = 0;
    this.log({ turnNumber, playerId, action: 'PLAY', card: placedCard });

    if (hand.length === 0) {
      return { card: placedCard, finished: this.playerWentOut(playerId, card) };
    }

    this.applyCardEffectAndAdvance(card);
    return { card: placedCard, finished: this.status === 'FINISHED' };
  }

  /**
   * Play several cards at once — a house rule on top of the base UNO deck:
   *  - NUMBER cards must also share one value (e.g. two "5"s in different colors).
   *  - SKIP cards: playing N at once skips N players instead of just one.
   *  - REVERSE cards: playing N at once flips the direction N times (net effect follows
   *    parity — two Reverses cancel out) in a 3+ player game; with exactly 2 players each
   *    Reverse acts like a Skip, so N of them skip N players, same as stacking Skip.
   *  - DRAW_TWO / WILD_DRAW_TWO / WILD_DRAW_FOUR, in ANY combination, can be laid down together
   *    in one move — their draw amounts simply add up (e.g. a Draw Two + a Wild Draw Four at
   *    once starts/extends the pending combo by 6). `chosenColor` is required whenever the
   *    stack includes a wild card and applies to all wild cards in it.
   * Mixing a draw-family card with a NUMBER/SKIP/REVERSE card in the same call is not allowed —
   * each family resolves differently. All cards must be a legal play against the current top
   * card (or, for a draw-family stack, legal to counter a pending combo), and the LAST card in
   * `cardIds` ends up on top of the discard pile (and is what resolves direction/colour), so the
   * order the caller sends `cardIds` in is the order the cards land.
   */
  playCards(playerId: string, cardIds: string[], turnNumber: number, chosenColor?: CardColor): { cards: Card[]; finished: boolean } {
    if (cardIds.length === 0) throw new GameError('CARD_NOT_IN_HAND');
    if (new Set(cardIds).size !== cardIds.length) throw new GameError('DUPLICATE_CARD_IN_PLAY');
    this.assertTurn(playerId, turnNumber, 'PLAYING');
    const hand = this.hands.get(playerId)!;

    const picked: Card[] = [];
    for (const id of cardIds) {
      const card = hand.find((c) => c.id === id);
      if (!card) throw new GameError('CARD_NOT_IN_HAND');
      picked.push(card);
    }

    if (picked.some((c) => c.kind === 'REFLECT' || c.kind === 'SHIELD' || c.kind === 'SHUFFLE')) {
      // Reflect / Shield / Shuffle always resolve alone — they can't be stacked with anything.
      if (picked.length === 1) {
        const r = this.playCard(playerId, picked[0].id, turnNumber);
        return { cards: [r.card], finished: r.finished };
      }
      throw new GameError('CARDS_NOT_STACKABLE');
    }

    const allDrawFamily = picked.every((c) => DRAW_FAMILY_KINDS.has(c.kind));
    const defendingCombo = this.pendingDraw?.targetId === playerId;

    if (allDrawFamily) return this.playDrawStack(playerId, picked, turnNumber, chosenColor, defendingCombo);
    if (defendingCombo) throw new GameError('MUST_COUNTER_OR_DRAW');

    const kind = picked[0].kind;
    if (kind !== 'NUMBER' && kind !== 'SKIP' && kind !== 'REVERSE') throw new GameError('CARDS_NOT_STACKABLE');
    if (!picked.every((c) => c.kind === kind)) throw new GameError('CARDS_MUST_MATCH_KIND');
    if (kind === 'NUMBER') {
      const value = picked[0].value;
      if (!picked.every((c) => c.value === value)) throw new GameError('CARDS_MUST_MATCH_VALUE');
    }
    // At least one card in the stack must be a legal opening play against the top card — order
    // doesn't matter (e.g. a RED 5 + GREEN 5 together against a GREEN top card is legal even if
    // the RED one happens to be selected first).
    if (!picked.some((c) => canPlayCard(c, this.topCard))) throw new GameError('CARD_NOT_PLAYABLE');

    for (const card of picked) {
      const idx = hand.findIndex((c) => c.id === card.id);
      hand.splice(idx, 1);
      this.discardPile.push(card);
    }
    this.consecutiveSkips = 0;
    this.log({ turnNumber, playerId, action: 'PLAY', card: picked[picked.length - 1], cards: picked });

    if (hand.length === 0) {
      const effectCard = kind === 'NUMBER' ? null : picked[picked.length - 1];
      return { cards: picked, finished: this.playerWentOut(playerId, effectCard, picked.length) };
    }
    if (kind === 'NUMBER') {
      this.advanceTurn();
    } else {
      this.applyCardEffectAndAdvance(picked[picked.length - 1], picked.length);
    }
    return { cards: picked, finished: this.status === 'FINISHED' };
  }

  /**
   * Lay down a same-turn stack of DRAW_TWO / WILD_DRAW_TWO / WILD_DRAW_FOUR cards (any mix) in
   * one move. Their draw amounts simply sum into a single pendingDraw bump — a Draw Two plus a
   * Wild Draw Four at once adds 6, not 2-then-4 as two separate turns.
   */
  private playDrawStack(
    playerId: string,
    picked: Card[],
    turnNumber: number,
    chosenColor: CardColor | undefined,
    defendingCombo: boolean,
  ): { cards: Card[]; finished: boolean } {
    const hand = this.hands.get(playerId)!;

    // Wild Draws (+2/+4/+8) and Draw Twos can never be laid together in one move — whether
    // opening a combo or answering one. (Several Wild Draws together, or several Draw Twos
    // together, are still fine.)
    if (picked.some((c) => isWildDrawKind(c.kind)) && picked.some((c) => c.kind === 'DRAW_TWO')) {
      throw new GameError('WILD_DRAW_NO_DRAW_TWO');
    }

    if (!defendingCombo) {
      // Not countering a pending combo — opening a new one just needs AT LEAST ONE card in the
      // stack to be a legal play against the current top card (same rule a lone card would
      // follow). The order the client selected cards in doesn't matter — e.g. a BLUE DRAW_TWO
      // plus a RED DRAW_TWO together against a BLUE-chosen top card is legal regardless of
      // which one happens to be first in `picked`.
      if (!picked.some((c) => canPlayCard(c, this.topCard))) throw new GameError('CARD_NOT_PLAYABLE');
    } else {
      // Defending against a pending combo — AT LEAST ONE card in the stack must legally counter
      // the pending combo (tier + color rules, same as a single countering play); the rest just
      // need to be draw-family cards too (any color/tier), their amounts simply add in. E.g. the
      // top is a WILD_DRAW_TWO chosen YELLOW: a YELLOW DRAW_TWO + a BLUE DRAW_TWO together are a
      // legal +4 counter, even though the BLUE one alone could never counter it.
      const top = this.topCard;
      if (!picked.every((c) => DRAW_FAMILY_KINDS.has(c.kind))) throw new GameError('MUST_COUNTER_OR_DRAW');
      const hasDrawTwo = picked.some((c) => c.kind === 'DRAW_TWO');
      // At least one card must legally counter: a Wild Draw of high-enough tier, or a Draw Two
      // (any color vs a Draw Two; matching color vs a Wild Draw Two) — extra Draw Twos ride along.
      if (!picked.some((c) => canCounterCombo(c, top))) {
        throw new GameError(hasDrawTwo ? 'DRAW_TWO_COLOR_MISMATCH' : 'MUST_COUNTER_OR_DRAW');
      }
    }

    const needsColor = picked.some((c) => isWild(c));
    if (needsColor && !chosenColor) throw new GameError('COLOR_REQUIRED');
    if (chosenColor && !COLORS.includes(chosenColor)) throw new GameError('INVALID_COLOR');

    const placed: Card[] = [];
    for (const card of picked) {
      const idx = hand.findIndex((c) => c.id === card.id);
      hand.splice(idx, 1);
      const placedCard = isWild(card) ? { ...card, color: chosenColor! } : card;
      this.discardPile.push(placedCard);
      placed.push(placedCard);
    }
    const totalDrawAmount = picked.reduce((sum, c) => sum + drawAmountFor(c.kind), 0);
    this.consecutiveSkips = 0;
    this.log({ turnNumber, playerId, action: 'PLAY', card: placed[placed.length - 1], cards: placed });

    if (hand.length === 0) {
      return { cards: placed, finished: this.playerWentOut(playerId, placed[placed.length - 1], 1, totalDrawAmount) };
    }
    this.applyCardEffectAndAdvance(placed[placed.length - 1], 1, totalDrawAmount);
    return { cards: placed, finished: this.status === 'FINISHED' };
  }

  drawCard(playerId: string, turnNumber: number, drawInsteadOfWild = false): { card: Card | null; skipped: boolean; stolen: boolean } {
    this.assertTurn(playerId, turnNumber, 'PLAYING');

    if (this.pendingDraw?.targetId === playerId) {
      // Choosing not to (or unable to) stack a Draw card: absorb the whole accumulated combo.
      // The turn does NOT end here — just like a normal draw, the player keeps their turn and
      // may immediately play a card if one of the newly drawn ones is playable.
      const { count } = this.pendingDraw;
      this.pendingDraw = null;
      this.log({ turnNumber, playerId, action: 'ABSORB', count });
      for (let i = 0; i < count; i++) {
        const drew = this.drawOrStealOne(playerId, turnNumber);
        if (!drew) break; // draw pile AND every other player's hand are both empty
        if (this.status === 'FINISHED') return { card: null, skipped: false, stolen: false }; // a steal just ended the game
      }
      this.consecutiveSkips = 0; // absorbing a combo is real progress, not a stuck-skip
      this.resolveStuckPlayers(); // covers the rare case they still can't act at all afterward
      return { card: null, skipped: false, stolen: false };
    }

    if (!drawInsteadOfWild && this.getPlayableIds(playerId).length > 0) throw new GameError('HAS_PLAYABLE_CARD');

    // Keep drawing/stealing one card at a time until a playable card turns up, or there is
    // truly nothing left anywhere (draw pile empty AND every other player's hand empty).
    let anyStolen = false;
    while (true) {
      const result = this.drawOrStealOne(playerId, turnNumber);
      if (!result) {
        // Nothing left to draw or steal from anyone — skip the turn.
        this.skipAndAdvance(playerId);
        return { card: null, skipped: true, stolen: anyStolen };
      }
      anyStolen = anyStolen || result.stolen;
      if (this.status === 'FINISHED') {
        // The steal that just happened emptied the donor's hand and ended the game outright
        // (only one player left standing) — nothing left to check, just hand back what we got.
        return { card: result.card, skipped: false, stolen: result.stolen };
      }
      if (this.isPlayableForPlayer(playerId, result.card)) {
        return { card: result.card, skipped: false, stolen: result.stolen };
      }
      // Not playable: if it came from the draw pile and the pile still has cards left, the
      // player keeps their turn and this single draw is the end of the action (matches normal
      // UNO: draw one, done; can draw again next time). But if the draw pile is now completely
      // empty (whether this card came from it or was stolen), keep going — stealing continues
      // one card at a time from the next player with cards until a playable one turns up.
      if (!result.stolen && this.drawPile.length > 0) {
        return { card: result.card, skipped: false, stolen: false };
      }
    }
  }

  /**
   * Draw exactly one card for `playerId`: from the draw pile if it still has cards, otherwise
   * steal one card from the nearest next player (in turn order, following the current
   * direction) who still has at least one card in hand — cascading to the player after that
   * once a donor's hand runs dry. Returns null only when the draw pile AND every other
   * player's hand are completely empty (true stalemate — nothing left anywhere to deal out).
   * If the steal leaves the donor holding zero cards, THEY are credited as having gone out too
   * — ranked in finish order right alongside players who empty their hand by playing it out.
   */
  private drawOrStealOne(playerId: string, turnNumber: number): { card: Card; stolen: boolean } | null {
    if (this.drawPile.length > 0) {
      const card = this.drawPile.pop()!;
      this.hands.get(playerId)!.push(card);
      this.cardsDrawn[playerId] = (this.cardsDrawn[playerId] ?? 0) + 1;
      this.log({ turnNumber, playerId, action: 'DRAW' });
      return { card, stolen: false };
    }

    const donorId = this.nextDonorFrom(playerId);
    if (!donorId) return null;

    const fromHand = this.hands.get(donorId)!;
    const randomIdx = this.rng(fromHand.length);
    const card = fromHand.splice(randomIdx, 1)[0];
    this.hands.get(playerId)!.push(card);
    this.cardsDrawn[playerId] = (this.cardsDrawn[playerId] ?? 0) + 1;
    this.log({ turnNumber, playerId, action: 'STEAL', card, fromPlayerId: donorId });
    if (fromHand.length === 0) this.markWentOutByTheft(donorId);
    return { card, stolen: true };
  }

  /** Being stolen down to zero cards counts as going out, same rank-order as playing your last
   *  card — the donor never played anything, so there's no card effect to resolve and no turn
   *  to advance, just: record their finish rank, drop their seat, and check for a game-ending
   *  last-player-standing state (the stealer might end up alone, right then and there). */
  private markWentOutByTheft(playerId: string) {
    this.finishedOrder.push(playerId);
    if (this.pendingDraw?.targetId === playerId) this.pendingDraw = null; // void rather than soft-lock
    this.removeFinishedSeat(playerId);
    if (this.status !== 'FINISHED' && this.seatOrder.length <= 1) {
      this.finish(this.finishedOrder[0], 'EMPTY_HAND');
    }
  }

  /**
   * Find the nearest player — walking forward from `excludeId` in current turn-order direction,
   * wrapping around the table — who currently holds at least one card. This is what makes
   * stealing always target "the next player" one card at a time: as long as that player still
   * has cards, repeated calls keep returning the same donor; once their hand is empty, the walk
   * naturally lands on whoever's next after them. Returns null if nobody else has any cards.
   */
  private nextDonorFrom(excludeId: string): string | null {
    const n = this.seatOrder.length;
    if (n <= 1) return null;
    let idx = this.seatOrder.indexOf(excludeId);
    if (idx < 0) idx = this.currentIndex;
    for (let i = 0; i < n; i++) {
      idx = nextSeatIndex(idx, n, this.direction ?? 'LEFT');
      const candidate = this.seatOrder[idx];
      if (candidate === excludeId) continue;
      if ((this.hands.get(candidate)?.length ?? 0) > 0) return candidate;
    }
    return null;
  }

  /**
   * A player just emptied their hand. Record their finish rank, let the card they played (if
   * any) resolve its normal effect against the remaining players, then drop their seat out of
   * the rotation for good. The game only truly ends once at most one player is left holding
   * cards — everyone else keeps playing a normal round-robin among themselves.
   */
  private playerWentOut(playerId: string, card: Card | null, count = 1, totalDrawAmount?: number): boolean {
    this.finishedOrder.push(playerId);
    // If the outgoing player was countering a pending combo with their last card(s), the combo
    // carries forward (amount keeps accumulating onto the next target) instead of vanishing —
    // only clear it here when they're going out WITHOUT extending it (e.g. an unrelated card).
    const continuesCombo = !!card && DRAW_FAMILY_KINDS.has(card.kind);
    if (this.pendingDraw?.targetId === playerId && !continuesCombo) this.pendingDraw = null;

    // Resolve the card's effect (if any) while the finished player's seat is still in the
    // rotation — step()/nextSeatIndex just needs a stable seatOrder to compute from, and the
    // outgoing player is never the one it lands on (direction always moves away from them).
    if (card && card.kind !== 'NUMBER') {
      this.applyCardEffectAndAdvance(card, count, totalDrawAmount);
    } else {
      this.advanceTurn();
    }

    this.removeFinishedSeat(playerId);

    if (this.status !== 'FINISHED' && this.seatOrder.length <= 1) {
      this.finish(this.finishedOrder[0], 'EMPTY_HAND');
    }
    return this.status === 'FINISHED';
  }

  /**
   * REFLECT (สะท้อนกลับ): bounce the entire pending combo back to whoever sent it (the player who
   * played the last draw card). If that player has already left the rotation, it goes to the
   * previous active seat instead (opposite to the current direction). The combo's size and tier
   * are unchanged — the Reflect card slides in UNDER the combo's top card, so the receiver still
   * answers the very same draw card (stack a legal draw card, reflect again, or absorb it).
   */
  private playReflect(playerId: string, handIdx: number, turnNumber: number): { card: Card; finished: boolean } {
    const hand = this.hands.get(playerId)!;
    const [card] = hand.splice(handIdx, 1);
    const pd = this.pendingDraw!;
    let target: string | null = pd.fromId && pd.fromId !== playerId && this.seatOrder.includes(pd.fromId) ? pd.fromId : null;
    if (!target) {
      const n = this.seatOrder.length;
      const opposite: Direction = this.direction === 'LEFT' ? 'RIGHT' : 'LEFT';
      target = this.seatOrder[nextSeatIndex(this.seatOrder.indexOf(playerId), n, opposite)];
    }
    this.discardPile.splice(Math.max(this.discardPile.length - 1, 0), 0, card);
    this.consecutiveSkips = 0;
    this.log({ turnNumber, playerId, action: 'REFLECT', card, fromPlayerId: pd.fromId ?? undefined, toPlayerId: target, count: pd.count });
    this.pendingDraw = { count: pd.count, targetId: target, fromId: playerId };
    this.currentIndex = this.seatOrder.indexOf(target);
    this.turnNumber++;

    if (hand.length === 0) {
      this.finishedOrder.push(playerId);
      this.removeFinishedSeat(playerId);
      if (this.status !== 'FINISHED' && this.seatOrder.length <= 1) this.finish(this.finishedOrder[0], 'EMPTY_HAND');
    }
    return { card, finished: this.status === 'FINISHED' };
  }

  /** A player emptied their hand with a colorless special card (Reflect/Shield/Shuffle). */
  private specialWentOut(playerId: string) {
    this.finishedOrder.push(playerId);
    this.removeFinishedSeat(playerId);
    if (this.status !== 'FINISHED' && this.seatOrder.length <= 1) this.finish(this.finishedOrder[0], 'EMPTY_HAND');
  }

  /**
   * SHIELD (โล่ป้องกัน): don't take the pending combo — pass it, unchanged (same size, same top
   * card), to the NEXT player in the current direction, who must answer it as usual.
   */
  private playShield(playerId: string, handIdx: number, turnNumber: number): { card: Card; finished: boolean } {
    const hand = this.hands.get(playerId)!;
    const [card] = hand.splice(handIdx, 1);
    const pd = this.pendingDraw!;
    const n = this.seatOrder.length;
    const target = this.seatOrder[nextSeatIndex(this.seatOrder.indexOf(playerId), n, this.direction ?? 'LEFT')];
    this.discardPile.splice(Math.max(this.discardPile.length - 1, 0), 0, card);
    this.consecutiveSkips = 0;
    this.log({ turnNumber, playerId, action: 'SHIELD', card, toPlayerId: target, count: pd.count });
    this.pendingDraw = { count: pd.count, targetId: target, fromId: playerId };
    this.currentIndex = this.seatOrder.indexOf(target);
    this.turnNumber++;
    if (hand.length === 0) this.specialWentOut(playerId);
    return { card, finished: this.status === 'FINISHED' };
  }

  /**
   * SHUFFLE (สลับที่นั่ง): playable any time it's your turn (even with a combo pending on you — it
   * stays on you). Randomly reshuffles the seating order of everyone still playing. The
   * shuffler keeps the turn and must still play a card (or draw if they can't); after that, play
   * continues with whoever now sits right after them (in the current direction).
   * The card slides under the top card, so the color/value to match is unchanged.
   */
  private playShuffleSeats(playerId: string, handIdx: number, turnNumber: number): { card: Card; finished: boolean } {
    const hand = this.hands.get(playerId)!;
    const [card] = hand.splice(handIdx, 1);
    const before = this.seatOrder.join(',');
    let order = shuffle([...this.seatOrder], this.rng);
    // make sure something visibly changes when there are 3+ players
    for (let i = 0; i < 5 && order.length > 2 && order.join(',') === before; i++) order = shuffle([...this.seatOrder], this.rng);
    this.seatOrder = order;
    this.discardPile.splice(Math.max(this.discardPile.length - 1, 0), 0, card);
    this.consecutiveSkips = 0;
    this.log({ turnNumber, playerId, action: 'SHUFFLE_SEATS', card, seatOrder: [...order] });
    this.currentIndex = order.indexOf(playerId);
    if (hand.length === 0) {
      // Shuffle was their last card: they go out, play moves on to whoever now sits after them
      // (a combo that was pending on them goes away with them, same as any non-draw last card).
      if (this.pendingDraw?.targetId === playerId) this.pendingDraw = null;
      this.advanceTurn();
      this.specialWentOut(playerId);
    } else {
      // The shuffler KEEPS the turn and must still lay down a card (or draw as usual if they
      // can't) — only then does play pass to whoever now sits after them in the new order.
      this.turnNumber++;
      this.resolveStuckPlayers();
    }
    return { card, finished: this.status === 'FINISHED' };
  }

  /**
   * Once the draw pile is exhausted and no combo is pending, a REFLECT card is only useful if some
   * player still holds a draw-family card (a future combo it could bounce). When nobody does, every
   * REFLECT card left in any hand vanishes on its own. A player emptied by this goes out (ranked)
   * just like one who played their last card.
   */
  private purgeDeadReflects() {
    if (this.drawPile.length > 0 || this.pendingDraw) return;
    let anyDrawCard = false;
    let anyReflect = false;
    for (const id of this.seatOrder) {
      for (const c of this.hands.get(id) ?? []) {
        if (DRAW_FAMILY_KINDS.has(c.kind)) anyDrawCard = true;
        if (c.kind === 'REFLECT' || c.kind === 'SHIELD') anyReflect = true;
      }
    }
    if (anyDrawCard || !anyReflect) return;
    const emptied: string[] = [];
    for (const id of [...this.seatOrder]) {
      const hand = this.hands.get(id)!;
      const isDead = (c: Card) => c.kind === 'REFLECT' || c.kind === 'SHIELD';
      const reflects = hand.filter(isDead);
      if (reflects.length === 0) continue;
      this.hands.set(id, hand.filter((c) => !isDead(c)));
      this.discardPile.splice(Math.max(this.discardPile.length - 1, 0), 0, ...reflects);
      this.log({ turnNumber: this.turnNumber, playerId: id, action: 'VANISH', count: reflects.length });
      if (this.hands.get(id)!.length === 0) emptied.push(id);
    }
    for (const id of emptied) {
      if (this.status === 'FINISHED') return;
      this.finishedOrder.push(id);
      if (this.currentPlayerId === id && this.seatOrder.length > 1) {
        this.currentIndex = nextSeatIndex(this.currentIndex, this.seatOrder.length, this.direction ?? 'LEFT');
        this.turnNumber++;
      }
      this.removeFinishedSeat(id);
      if (this.seatOrder.length <= 1) this.finish(this.finishedOrder[0], 'EMPTY_HAND');
    }
  }

  /** Drop a finished player's seat out of the active rotation, keeping currentIndex valid. */
  private removeFinishedSeat(playerId: string) {
    const idx = this.seatOrder.indexOf(playerId);
    if (idx < 0) return;
    this.seatOrder.splice(idx, 1);
    if (this.seatOrder.length === 0) return;
    if (idx < this.currentIndex) this.currentIndex--;
    else if (idx === this.currentIndex) this.currentIndex = this.currentIndex % this.seatOrder.length;
  }

  removePlayer(playerId: string) {
    const idx = this.seatOrder.indexOf(playerId);
    if (idx < 0) return;
    this.drawPile.unshift(...(this.hands.get(playerId) ?? []));
    this.hands.delete(playerId);
    if (this.pendingDraw?.targetId === playerId) this.pendingDraw = null; // combo target left — void it rather than soft-lock
    const wasCurrent = idx === this.currentIndex;
    this.seatOrder.splice(idx, 1);
    if (this.status === 'FINISHED') return;

    if (this.seatOrder.length < MIN_PLAYERS) {
      this.finish(this.seatOrder[0] ?? null, 'LAST_PLAYER');
      return;
    }
    const n = this.seatOrder.length;
    this.consecutiveSkips = 0;
    if (idx < this.currentIndex) {
      this.currentIndex--;
    } else if (wasCurrent) {
      if (this.status === 'CHOOSING_DIRECTION') {
        this.currentIndex = idx % n;
        this.firstPlayerId = this.seatOrder[this.currentIndex];
      } else {
        this.currentIndex = this.direction === 'RIGHT' ? (idx - 1 + n) % n : idx % n;
      }
      this.turnNumber++;
      if (this.status === 'PLAYING') this.resolveStuckPlayers();
    }
  }

  // Internals
  private assertTurn(playerId: string, turnNumber: number, expected: GameStatus) {
    if (this.status === 'FINISHED') throw new GameError('GAME_FINISHED');
    if (this.status !== expected) {
      throw new GameError(expected === 'PLAYING' ? 'DIRECTION_NOT_SELECTED' : 'DIRECTION_ALREADY_SELECTED');
    }
    if (this.currentPlayerId !== playerId) throw new GameError('NOT_YOUR_TURN');
    if (turnNumber !== this.turnNumber) throw new GameError('STALE_TURN');
  }

  /** canPlayCard() — the Wild Draw "no color match in hand" house rule has been removed, so
   *  this is now just a thin alias kept for readability at call sites. */
  private isPlayableForPlayer(_playerId: string, card: Card): boolean {
    return canPlayCard(card, this.topCard);
  }

  /**
   * House rule: once the draw pile AND the discard pile are both exhausted, a player who can't
   * play pulls cards straight from the next player's hand — cascading to whoever's next in turn
   * order if that hand also runs dry — until one of the stolen cards can actually be played.
   * Returns null only if every other player's hand is empty too (true stalemate).
   */
  /** Move currentIndex one seat in the current direction and bump the turn counter. No side effects. */
  private step() {
    this.currentIndex = nextSeatIndex(this.currentIndex, this.seatOrder.length, this.direction ?? 'LEFT');
    this.turnNumber++;
  }

  private advanceTurn() {
    this.step();
    this.resolveStuckPlayers();
  }

  /**
   * Resolve the just-played card's special effect, then hand the turn to whoever should act
   * next. `count` is how many copies of this SKIP/REVERSE kind were played together in one
   * move (always 1 for a single playCard()) — stacking N Skips skips N players, and stacking
   * N Reverses flips direction N times (2-player games treat Reverse as Skip, so it instead
   * skips N players, same as Skip).
   */
  private applyCardEffectAndAdvance(card: Card, count = 1, totalDrawAmount?: number) {
    if (DRAW_FAMILY_KINDS.has(card.kind)) {
      const amount = totalDrawAmount ?? drawAmountFor(card.kind);
      const fromId = this.currentPlayerId; // whoever just played the draw card(s)
      this.step(); // move to the player this combo now targets
      if (this.status === 'FINISHED') return;
      this.pendingDraw = { count: (this.pendingDraw?.count ?? 0) + amount, targetId: this.currentPlayerId!, fromId };
      // Deliberately skip resolveStuckPlayers' normal auto-skip here — the target always has a
      // real action available (stack a Draw card, or drawCard() to absorb the combo).
      return;
    }

    let skipCount = 0;
    const others = this.seatOrder.length - 1;
    switch (card.kind) {
      case 'SKIP':
        // N Skips skip the next N players — but never wrap past yourself: skipping everyone else
        // (always the case with 2 players, however many Skips) brings the turn back to you.
        skipCount = Math.min(count, others);
        break;
      case 'REVERSE':
        if (count % 2 === 1) this.direction = this.direction === 'LEFT' ? 'RIGHT' : 'LEFT';
        if (this.seatOrder.length <= 2) {
          // 2 players: any number of Reverses plays like a Skip → straight back to you.
          skipCount = others;
        }
        // 3+ players: no one is skipped — direction may have flipped, play just moves on.
        break;
      default:
        break;
    }

    this.step(); // move to the player targeted by the effect
    if (this.status === 'FINISHED') return;
    for (let i = 0; i < skipCount; i++) {
      this.step(); // skip the targeted player, move to the one after
      if (this.status === 'FINISHED') return;
    }

    this.resolveStuckPlayers();
  }

  private resolveStuckPlayers() {
    if (this.status !== 'PLAYING') return;
    this.purgeDeadReflects();
    if (this.status !== 'PLAYING') return;
    const pid = this.currentPlayerId!;
    if (this.pendingDraw?.targetId === pid) return; // they must act: stack a Draw card or absorb the combo
    if (this.getPlayableIds(pid).length > 0) return;
    // Even with an empty draw pile, they can still draw by stealing from the next player with
    // cards — only truly stuck (and skipped) if BOTH the draw pile and every other hand are empty.
    if (this.drawPile.length > 0 || this.nextDonorFrom(pid) !== null) return;
    this.skipAndAdvance(pid);
  }

  private skipAndAdvance(playerId: string) {
    this.log({ turnNumber: this.turnNumber, playerId, action: 'SKIP' });
    this.consecutiveSkips++;
    if (this.consecutiveSkips >= this.seatOrder.length) {
      let best = this.seatOrder[0];
      for (const id of this.seatOrder) {
        if (this.hands.get(id)!.length < this.hands.get(best)!.length) best = id;
      }
      this.finish(best, 'STALEMATE');
      return;
    }
    this.advanceTurn();
  }

  private finish(winnerId: string | null, reason: FinishReason) {
    this.status = 'FINISHED';
    this.winnerId = winnerId;
    this.finishReason = reason;
    this.endedAt = this.now();
    this.pendingDraw = null;
  }

  private log(entry: Omit<HistoryEntry, 'seq' | 'at'>) {
    this.history.push({ ...entry, seq: ++this.seq, at: this.now() });
    if (this.history.length > 200) this.history.shift();
  }
}