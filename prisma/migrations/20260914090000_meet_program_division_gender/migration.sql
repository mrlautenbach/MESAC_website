-- A meet-style named event gets its own skill-level Division (Varsity/JV,
-- independent of the session's own Event.divisionId, since one session can
-- mix levels) and a separate Girls/Boys Gender axis. event_number, not
-- event_name, becomes the authoritative identity of one race within a
-- session, so a prelim/final pair sharing a number still displays together
-- even if their names were typed slightly differently.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('GIRLS', 'BOYS');

-- AlterTable
ALTER TABLE "MeetProgramEntry" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "MeetProgramEntry" ADD COLUMN "gender" "Gender";

-- AlterTable
ALTER TABLE "MeetResult" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "MeetResult" ADD COLUMN "gender" "Gender";

-- DropIndex (superseded by the eventNumber-based unique index below)
DROP INDEX "MeetProgramEntry_eventId_eventName_round_key";

-- CreateIndex
CREATE UNIQUE INDEX "MeetProgramEntry_eventId_eventNumber_round_key" ON "MeetProgramEntry"("eventId", "eventNumber", "round");
CREATE INDEX "MeetProgramEntry_divisionId_idx" ON "MeetProgramEntry"("divisionId");
CREATE INDEX "MeetResult_divisionId_idx" ON "MeetResult"("divisionId");

-- AddForeignKey
ALTER TABLE "MeetProgramEntry" ADD CONSTRAINT "MeetProgramEntry_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetResult" ADD CONSTRAINT "MeetResult_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
