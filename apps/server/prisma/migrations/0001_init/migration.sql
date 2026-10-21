CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "turns" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "winnerName" TEXT,
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "cardsLeft" INTEGER NOT NULL,
    "cardsDrawn" INTEGER NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Room_code_idx" ON "Room"("code");
CREATE INDEX "Match_roomId_idx" ON "Match"("roomId");
CREATE INDEX "MatchPlayer_matchId_idx" ON "MatchPlayer"("matchId");

ALTER TABLE "Match" ADD CONSTRAINT "Match_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;