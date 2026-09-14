-- A meet program entry now owns its own round-level schedule (session,
-- time, location, live stream, status) instead of inheriting it wholesale
-- from its session Event - a prelim and its final commonly run in two
-- different sessions at different times. event_number/round uniqueness
-- moves from per-session to per-tournament, since it's no longer safe to
-- assume both rounds of one race share an eventId.

-- AlterTable
ALTER TABLE "MeetProgramEntry" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "MeetProgramEntry" ADD COLUMN "scheduledTime" TIMESTAMP(3);
ALTER TABLE "MeetProgramEntry" ADD COLUMN "location" TEXT;
ALTER TABLE "MeetProgramEntry" ADD COLUMN "liveStreamUrl" TEXT;
ALTER TABLE "MeetProgramEntry" ADD COLUMN "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED';

-- Backfill from the existing session Event - the best available value for
-- any row created before this migration.
UPDATE "MeetProgramEntry" pe
SET "tournamentId" = e."tournamentId",
    "scheduledTime" = e."date"
FROM "Event" e
WHERE e."id" = pe."eventId";

ALTER TABLE "MeetProgramEntry" ALTER COLUMN "tournamentId" SET NOT NULL;
ALTER TABLE "MeetProgramEntry" ALTER COLUMN "scheduledTime" SET NOT NULL;

-- DropIndex (superseded by the tournamentId-based unique index below)
DROP INDEX "MeetProgramEntry_eventId_eventNumber_round_key";

-- CreateIndex
CREATE UNIQUE INDEX "MeetProgramEntry_tournamentId_eventNumber_round_key" ON "MeetProgramEntry"("tournamentId", "eventNumber", "round");
CREATE INDEX "MeetProgramEntry_tournamentId_idx" ON "MeetProgramEntry"("tournamentId");

-- AddForeignKey
ALTER TABLE "MeetProgramEntry" ADD CONSTRAINT "MeetProgramEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
