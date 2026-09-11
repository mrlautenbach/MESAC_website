-- CreateTable
CREATE TABLE "MeetProgramEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventNumber" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "round" "MeetResultRound" NOT NULL DEFAULT 'FINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetProgramEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetProgramEntry_eventId_idx" ON "MeetProgramEntry"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetProgramEntry_eventId_eventName_round_key" ON "MeetProgramEntry"("eventId", "eventName", "round");

-- AddForeignKey
ALTER TABLE "MeetProgramEntry" ADD CONSTRAINT "MeetProgramEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
