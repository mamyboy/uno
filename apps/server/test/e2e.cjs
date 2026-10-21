const { io } = require('socket.io-client');

function connect() {
  return io('http://localhost:4000', { transports: ['websocket'] });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** emit + await ack, retrying transient RATE_LIMITED acks with a short backoff. */
async function emitWithRetry(socket, event, payload, retries = 8) {
  for (let i = 0; i <= retries; i++) {
    const ack = await new Promise((resolve) => socket.emit(event, payload, resolve));
    if (!(ack && ack.ok === false && ack.error === 'RATE_LIMITED')) return ack;
    await sleep(60 * (i + 1));
  }
  return { ok: false, error: 'RATE_LIMITED' };
}

/**
 * Tracks latest pushed game/hand state for one socket, mirroring what a real client does — no
 * polling. `gameSeq` increments on EVERY game:state broadcast (sent to the whole room on every
 * single server-side mutation, regardless of who acted or whether turnNumber changed — e.g. a
 * draw that doesn't end the turn still re-broadcasts). It's the reliable "something happened"
 * signal; waiting on turnNumber alone is wrong because a draw can legitimately leave it unchanged.
 */
function trackState(socket) {
  const state = { game: null, hand: null, gameSeq: 0 };
  socket.on('game:state', (g) => { state.game = g; state.gameSeq++; });
  socket.on('game:hand_updated', (h) => { state.hand = h; });
  return state;
}

async function waitFor(fn, timeoutMs = 8000, intervalMs = 20) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  throw new Error('waitFor timed out');
}

async function run() {
  const host = connect();
  const guest = connect();

  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => guest.on('connect', r));

  const hostState = trackState(host);
  const guestState = trackState(guest);

  const createAck = await new Promise((resolve) =>
    host.emit('room:create', { name: 'E2E Room', nickname: 'Host', maxPlayers: 4, hostPlays: true }, resolve),
  );
  if (!createAck.ok) throw new Error('create failed: ' + createAck.error);
  const code = createAck.code;
  console.log('Room created:', code);

  const joinAck = await new Promise((resolve) =>
    guest.emit('room:join', { code, nickname: 'Guest' }, resolve),
  );
  if (!joinAck.ok) throw new Error('join failed: ' + joinAck.error);
  console.log('Guest joined. Players:', joinAck.snapshot.room.players.map((p) => p.nickname));

  const startAck = await new Promise((resolve) => host.emit('game:start', {}, resolve));
  if (!startAck.ok) throw new Error('start failed: ' + startAck.error);
  console.log('Game started.');

  // game:start's ack doesn't carry hand/game state — wait for the pushed broadcasts
  // (mirrors how the real frontend reacts to game:state / game:hand_updated).
  let game = await waitFor(() => hostState.game);
  console.log('Status:', game.gameStatus, 'First player:', game.firstPlayerId);

  const firstIsHost = game.firstPlayerId === createAck.playerId;
  const firstSocket = firstIsHost ? host : guest;
  const firstState = firstIsHost ? hostState : guestState;
  const firstHand = await waitFor(() => firstState.hand);
  console.log('First player hand size:', firstHand.hand.length);

  const dirAck = await new Promise((resolve) =>
    firstSocket.emit('game:select_direction', { direction: 'LEFT', turnNumber: game.turnNumber }, resolve),
  );
  if (!dirAck.ok) throw new Error('direction failed: ' + dirAck.error);
  console.log('Direction selected OK.');
  await waitFor(() => hostState.game && hostState.game.gameStatus !== 'CHOOSING_DIRECTION');

  // Play up to 400 turns until someone wins or we give up (safety). State comes from the pushed
  // game:state / game:hand_updated events already captured above. After every action we wait for
  // hostState.gameSeq to tick at least once (the host always receives every room broadcast,
  // whoever acted) before reading state again — this is correct even for a draw that leaves the
  // same player's turn in place (turnNumber unchanged), unlike waiting on turnNumber directly.
  let turns = 0;
  let finished = false;
  let winner = null;
  while (turns < 500 && !finished) {
    const g = hostState.game;
    if (g.gameStatus === 'FINISHED') {
      finished = true;
      winner = g.winnerId;
      break;
    }
    const currentIsHost = g.currentPlayerId === createAck.playerId;
    const actor = currentIsHost ? host : guest;
    await waitFor(() => {
      const h = currentIsHost ? hostState.hand : guestState.hand;
      return h && h.isMyTurn ? h : null;
    });
    const hand = currentIsHost ? hostState.hand : guestState.hand;
    if (!hand) throw new Error('no hand for current player');

    const seqBefore = hostState.gameSeq;
    let tookAction = true;
    if (hand.playableCardIds.length > 0) {
      const cardId = hand.playableCardIds[0];
      const card = hand.hand.find((c) => c.id === cardId);
      const payload = { cardId, turnNumber: g.turnNumber };
      if (card && card.color === null) payload.chosenColor = ['RED', 'YELLOW', 'GREEN', 'BLUE'][turns % 4];
      const ack = await emitWithRetry(actor, 'game:play_card', payload);
      if (!ack.ok) throw new Error('play_card failed: ' + ack.error);
      if (ack.finished) {
        finished = true;
        winner = currentIsHost ? createAck.playerId : joinAck.playerId;
      }
    } else if (hand.canDraw) {
      const ack = await emitWithRetry(actor, 'game:draw_card', { turnNumber: g.turnNumber });
      if (!ack.ok) throw new Error('draw_card failed: ' + ack.error);
    } else {
      // Shouldn't normally happen — resolveStuckPlayers() on the server auto-skips a player
      // with zero playable cards and an exhausted deck before it ever reaches the client.
      console.log('WARNING: current player has no playable card and cannot draw; waiting briefly.');
      tookAction = false;
      await sleep(50);
    }
    if (!finished && tookAction) {
      await waitFor(() => hostState.gameSeq > seqBefore);
      await sleep(10); // let any accompanying hand_updated for this tick settle too
    }
    turns++;
    if (turns % 20 === 0) console.log('progress: turn', turns, 'status', g.gameStatus, 'turnNumber', g.turnNumber, 'cardCounts', g.cardCounts);
  }

  console.log('Turns played:', turns, 'Finished:', finished, 'Winner:', winner);
  if (!finished) throw new Error('Game did not finish within turn budget (possible deadlock)');

  const restartAck = await new Promise((resolve) => host.emit('game:restart', {}, resolve));
  console.log('Restart ok:', restartAck.ok);

  host.close();
  guest.close();
  console.log('E2E TEST PASSED');
  process.exit(0);
}

run().catch((err) => {
  console.error('E2E TEST FAILED:', err.message);
  process.exit(1);
});
