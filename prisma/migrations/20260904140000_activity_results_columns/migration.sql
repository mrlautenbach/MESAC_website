-- Per-column visibility toggles for the results table, defaulting to
-- everything visible (matches today's fixed layout).
ALTER TABLE "Activity" ADD COLUMN "showWins" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Activity" ADD COLUMN "showLosses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Activity" ADD COLUMN "showPointsFor" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Activity" ADD COLUMN "showPointsAgainst" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Activity" ADD COLUMN "showPlayed" BOOLEAN NOT NULL DEFAULT true;
