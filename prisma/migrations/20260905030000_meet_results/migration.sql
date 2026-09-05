ALTER TABLE "Activity" ADD COLUMN "usesMeetResults" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "MeetResultRound" AS ENUM ('PRELIM', 'FINAL');

CREATE TABLE "MeetResult" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "round" "MeetResultRound" NOT NULL DEFAULT 'FINAL',
    "place" INTEGER,
    "athleteName" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "mark" TEXT NOT NULL,
    "points" DOUBLE PRECISION,
    "recordNotation" TEXT,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetResult_eventId_idx" ON "MeetResult"("eventId");
CREATE INDEX "MeetResult_eventId_eventName_idx" ON "MeetResult"("eventId", "eventName");

ALTER TABLE "MeetResult" ADD CONSTRAINT "MeetResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetResult" ADD CONSTRAINT "MeetResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
