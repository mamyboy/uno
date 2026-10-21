import { createServer } from 'node:http';
import { parse } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';
import { Persistence } from './db/persistence';
import { registerSocketHandlers } from './socket/handlers';

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';

const httpServer = createServer((req, res) => {
  const parsed = parse(req.url ?? '', true);
  if (parsed.pathname === '/' || parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Color Match Arena Server is running');
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN === '*' ? '*' : CLIENT_ORIGIN.split(','),
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();
roomManager.ensureStaticRooms();
const persistence = new Persistence(process.env.DATABASE_URL);

registerSocketHandlers(io, roomManager, persistence);

httpServer.listen(PORT, () => {
  console.log(`[server] Color Match Arena listening on port ${PORT}`);
});

async function shutdown() {
  await persistence.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);