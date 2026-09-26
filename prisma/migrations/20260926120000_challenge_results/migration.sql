-- Academic Games' challenge results: each school's place and score in one
-- challenge, per division.
CREATE TABLE "ChallengeResult" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "divisionId" TEXT,
    "schoolId" TEXT NOT NULL,
    "place" INTEGER,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChallengeResult_tournamentId_divisionId_idx" ON "ChallengeResult"("tournamentId", "divisionId");
CREATE INDEX "ChallengeResult_eventId_idx" ON "ChallengeResult"("eventId");

ALTER TABLE "ChallengeResult" ADD CONSTRAINT "ChallengeResult_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeResult" ADD CONSTRAINT "ChallengeResult_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeResult" ADD CONSTRAINT "ChallengeResult_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeResult" ADD CONSTRAINT "ChallengeResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
