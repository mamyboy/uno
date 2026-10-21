import { io, Socket } from 'socket.io-client';

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || '';
export const socket: Socket = io(serverUrl || (typeof window !== 'undefined' ? window.location.origin : undefined), {
  transports: ['websocket', 'polling'],
  autoConnect: true,
});