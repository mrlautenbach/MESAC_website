-- CreateEnum
CREATE TYPE "SlotOutcome" AS ENUM ('WINNER', 'LOSER');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "awaySourceEventId" TEXT,
ADD COLUMN     "awaySourceOutcome" "SlotOutcome",
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "homeSourceEventId" TEXT,
ADD COLUMN     "homeSourceOutcome" "SlotOutcome";

-- AlterTable
ALTER TABLE "EventParticipant" ADD COLUMN     "isHome" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TournamentField" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFieldValue" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "EventFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentField_tournamentId_key_key" ON "TournamentField"("tournamentId", "key");

-- CreateIndex
CREATE INDEX "EventFieldValue_fieldId_idx" ON "EventFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFieldValue_eventId_fieldId_key" ON "EventFieldValue"("eventId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_seasonId_externalId_key" ON "Event"("seasonId", "externalId");

-- AddForeignKey
ALTER TABLE "TournamentField" ADD CONSTRAINT "TournamentField_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_homeSourceEventId_fkey" FOREIGN KEY ("homeSourceEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_awaySourceEventId_fkey" FOREIGN KEY ("awaySourceEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFieldValue" ADD CONSTRAINT "EventFieldValue_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFieldValue" ADD CONSTRAINT "EventFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TournamentField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

