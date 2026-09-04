-- Per-tournament toggle for whether each gender's division gets its own
-- team-photo section, defaulting to both shown (matches today's layout).
ALTER TABLE "Tournament" ADD COLUMN "showGirlsTeamPhotos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tournament" ADD COLUMN "showBoysTeamPhotos" BOOLEAN NOT NULL DEFAULT true;
