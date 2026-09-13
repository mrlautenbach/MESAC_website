-- Per-tournament participation roster. A row only exists once an admin has
-- moved a school off its default, so existing tournaments need no backfill:
-- no row means "follow the school's league membership".

-- CreateTable
CREATE TABLE "TournamentSchool" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "participating" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentSchool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentSchool_tournamentId_idx" ON "TournamentSchool"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentSchool_tournamentId_schoolId_key" ON "TournamentSchool"("tournamentId", "schoolId");

-- AddForeignKey
ALTER TABLE "TournamentSchool" ADD CONSTRAINT "TournamentSchool_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentSchool" ADD CONSTRAINT "TournamentSchool_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
