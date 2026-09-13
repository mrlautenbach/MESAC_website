-- Indexes for the read paths the public pages and the CSV importer actually
-- run. Written by hand and applied with `prisma migrate deploy` (the local dev
-- database has drift that blocks `prisma migrate dev`).

-- CreateIndex
CREATE INDEX "Event_tournamentId_date_idx" ON "Event"("tournamentId", "date");

-- CreateIndex
CREATE INDEX "Event_status_date_idx" ON "Event"("status", "date");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_homeSourceEventId_idx" ON "Event"("homeSourceEventId");

-- CreateIndex
CREATE INDEX "Event_awaySourceEventId_idx" ON "Event"("awaySourceEventId");

-- CreateIndex
CREATE INDEX "Photo_featuredOnHome_createdAt_idx" ON "Photo"("featuredOnHome", "createdAt");
