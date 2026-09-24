-- Golf's team match play: school-vs-school matches per round, each made of
-- three pairs matches (one per flight).
CREATE TYPE "GolfPairsWinner" AS ENUM ('HOME', 'AWAY', 'HALVED');

CREATE TABLE "GolfTeamMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "course" TEXT,
    "homeSchoolId" TEXT NOT NULL,
    "awaySchoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfTeamMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GolfPairsMatch" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "flight" INTEGER NOT NULL,
    "startHole" INTEGER,
    "marshal" TEXT,
    "winner" "GolfPairsWinner",
    "margin" TEXT,

    CONSTRAINT "GolfPairsMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GolfTeamMatch_tournamentId_round_homeSchoolId_awaySchoolId_key" ON "GolfTeamMatch"("tournamentId", "round", "homeSchoolId", "awaySchoolId");
CREATE INDEX "GolfTeamMatch_tournamentId_idx" ON "GolfTeamMatch"("tournamentId");
CREATE UNIQUE INDEX "GolfPairsMatch_matchId_flight_key" ON "GolfPairsMatch"("matchId", "flight");

ALTER TABLE "GolfTeamMatch" ADD CONSTRAINT "GolfTeamMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GolfTeamMatch" ADD CONSTRAINT "GolfTeamMatch_homeSchoolId_fkey" FOREIGN KEY ("homeSchoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GolfTeamMatch" ADD CONSTRAINT "GolfTeamMatch_awaySchoolId_fkey" FOREIGN KEY ("awaySchoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GolfPairsMatch" ADD CONSTRAINT "GolfPairsMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "GolfTeamMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
