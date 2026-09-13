-- External live-timing/live-results feed link for a tournament (e.g. a
-- swim/track meet's results platform), independent of Event.streamUrl.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "liveResultsUrl" TEXT;
