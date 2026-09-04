-- One row per (tournament, school, division) team-photo slot. A row only
-- exists once an admin uploads a photo or explicitly disables the slot -
-- an absent row is treated as enabled with no photo yet.
CREATE TABLE "TeamPhoto" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "divisionId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "photoUrl" TEXT,
    "blobPathname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamPhoto_tournamentId_schoolId_divisionId_key" ON "TeamPhoto"("tournamentId", "schoolId", "divisionId");

ALTER TABLE "TeamPhoto" ADD CONSTRAINT "TeamPhoto_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamPhoto" ADD CONSTRAINT "TeamPhoto_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamPhoto" ADD CONSTRAINT "TeamPhoto_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
