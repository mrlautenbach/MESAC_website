ALTER TABLE "Activity" ADD COLUMN "usesSetScores" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EventSet" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventSet_eventId_setNumber_key" ON "EventSet"("eventId", "setNumber");
CREATE INDEX "EventSet_eventId_idx" ON "EventSet"("eventId");

ALTER TABLE "EventSet" ADD CONSTRAINT "EventSet_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
