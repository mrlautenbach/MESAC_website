-- Academic Games' Academic Bowl: teams (a school can field several per
-- division) and their games - the round robin, then seeded finals.
CREATE TYPE "BowlStage" AS ENUM ('ROUND_ROBIN', 'QUARTERFINAL', 'SEMIFINAL', 'CONSOLATION', 'FINAL');

CREATE TABLE "BowlTeam" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BowlTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BowlGame" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "stage" "BowlStage" NOT NULL DEFAULT 'ROUND_ROBIN',
    "number" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "room" TEXT,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "sourceA" TEXT,
    "sourceB" TEXT,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BowlGame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BowlTeam_divisionId_schoolId_name_key" ON "BowlTeam"("divisionId", "schoolId", "name");
CREATE INDEX "BowlGame_tournamentId_divisionId_stage_number_idx" ON "BowlGame"("tournamentId", "divisionId", "stage", "number");

ALTER TABLE "BowlTeam" ADD CONSTRAINT "BowlTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BowlTeam" ADD CONSTRAINT "BowlTeam_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BowlTeam" ADD CONSTRAINT "BowlTeam_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BowlGame" ADD CONSTRAINT "BowlGame_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BowlGame" ADD CONSTRAINT "BowlGame_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BowlGame" ADD CONSTRAINT "BowlGame_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "BowlTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BowlGame" ADD CONSTRAINT "BowlGame_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "BowlTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
