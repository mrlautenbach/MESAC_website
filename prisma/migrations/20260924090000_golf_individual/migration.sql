-- Golf's own format: a Day 1 individual round by flight (points, higher is
-- better) whose school totals seed a team match-play event.
ALTER TABLE "Activity" ADD COLUMN "usesGolfFormat" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Activity" SET "usesGolfFormat" = true WHERE "name" = 'Golf';

CREATE TABLE "GolfGroup" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "flight" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "teeTime" TIMESTAMP(3) NOT NULL,
    "course" TEXT,
    "marshal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GolfPlayer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER,
    "gender" TEXT,
    "points" INTEGER,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GolfGroup_tournamentId_number_key" ON "GolfGroup"("tournamentId", "number");
CREATE UNIQUE INDEX "GolfPlayer_tournamentId_schoolId_seed_key" ON "GolfPlayer"("tournamentId", "schoolId", "seed");
CREATE INDEX "GolfPlayer_groupId_idx" ON "GolfPlayer"("groupId");

ALTER TABLE "GolfGroup" ADD CONSTRAINT "GolfGroup_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GolfPlayer" ADD CONSTRAINT "GolfPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GolfPlayer" ADD CONSTRAINT "GolfPlayer_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GolfPlayer" ADD CONSTRAINT "GolfPlayer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GolfGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
