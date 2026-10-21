import { PrismaClient } from '@prisma/client';
import type { GameResult } from '@cma/shared';
import type { ServerRoom } from '../rooms/RoomManager';

export class Persistence {
  private prisma: PrismaClient | null;

  constructor(databaseUrl?: string) {
    this.prisma = databaseUrl ? new PrismaClient() : null;
  }

  async roomCreated(room: ServerRoom) {
    if (!this.prisma) return;
    try { await this.upsertRoom(room); } catch (err) { console.warn('[db] roomCreated failed', err); }
  }

  async saveMatch(room: ServerRoom, result: GameResult) {
    if (!this.prisma) return;
    try {
      await this.upsertRoom(room);
      await this.prisma.match.create({
        data: {
          id: result.gameId,
          roomId: room.id,
          startedAt: new Date(result.startedAt),
          endedAt: new Date(result.endedAt),
          durationMs: result.durationMs,
          turns: result.turns,
          reason: result.reason,
          winnerName: result.ranking.find((r) => r.playerId === result.winnerId)?.nickname ?? null,
          players: {
            create: result.ranking.map((r) => ({
              nickname: r.nickname, rank: r.rank, cardsLeft: r.cardsLeft,
              cardsDrawn: r.cardsDrawn, isWinner: r.playerId === result.winnerId,
            })),
          },
        },
      });
    } catch (err) {
      console.warn('[db] saveMatch failed', err);
    }
  }

  async close() { await this.prisma?.$disconnect(); }

  private upsertRoom(room: ServerRoom) {
    return this.prisma!.room.upsert({
      where: { id: room.id },
      create: { id: room.id, code: room.code, name: room.name, maxPlayers: room.maxPlayers },
      update: {},
    });
  }
}