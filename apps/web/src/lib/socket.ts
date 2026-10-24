import { io, Socket } from 'socket.io-client';

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || '';

/** WebSocket from the very first connection (no HTTP long-polling handshake + upgrade, which costs
 *  extra round-trips and delays the first real-time event). If a network blocks WebSockets, we
 *  fall back to polling after a couple of failed attempts so the game still works. */
export const socket: Socket = io(serverUrl || (typeof window !== 'undefined' ? window.location.origin : undefined), {
  transports: ['websocket'],
  upgrade: false,
  autoConnect: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

let wsFailures = 0;
socket.on('connect_error', () => {
  wsFailures++;
  if (wsFailures >= 2 && socket.io.opts.transports?.[0] === 'websocket') {
    socket.io.opts.transports = ['polling', 'websocket'];
    socket.io.opts.upgrade = true;
  }
});
socket.on('connect', () => {
  wsFailures = 0;
});
