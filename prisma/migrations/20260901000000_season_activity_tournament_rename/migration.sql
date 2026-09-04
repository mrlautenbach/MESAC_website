-- Introduces a real top-level Season (Season 1/2/3) above the existing
-- Tournament model, and renames the two existing layers to make room:
--   old Tournament (recurring identity, e.g. "Varsity Volleyball") -> Activity
--   old Season (yearly edition, e.g. "Fall 2026")                 -> Tournament
-- Table/column renames preserve all existing rows (18 activities, 14
-- divisions, 18 tournament editions) - nothing is dropped or recreated.

-- Table renames (Postgres updates dependent FKs/indexes automatically)
ALTER TABLE "Tournament" RENAME TO "Activity";
ALTER TABLE "Season" RENAME TO "Tournament";
ALTER TABLE "TournamentField" RENAME TO "ActivityField";

-- Column renames
ALTER TABLE "Tournament" RENAME COLUMN "tournamentId" TO "activityId";
ALTER TABLE "Division" RENAME COLUMN "tournamentId" TO "activityId";
ALTER TABLE "ActivityField" RENAME COLUMN "tournamentId" TO "activityId";
ALTER TABLE "Event" RENAME COLUMN "seasonId" TO "tournamentId";

-- Constraint renames (cosmetic - free "Tournament_pkey" first to avoid a
-- collision with the still-old-named pkey on the newly-renamed Activity)
ALTER TABLE "Activity" RENAME CONSTRAINT "Tournament_pkey" TO "Activity_pkey";
ALTER TABLE "Tournament" RENAME CONSTRAINT "Season_pkey" TO "Tournament_pkey";
ALTER TABLE "Tournament" RENAME CONSTRAINT "Season_hostSchoolId_fkey" TO "Tournament_hostSchoolId_fkey";
ALTER TABLE "Tournament" RENAME CONSTRAINT "Season_tournamentId_fkey" TO "Tournament_activityId_fkey";
ALTER TABLE "ActivityField" RENAME CONSTRAINT "TournamentField_pkey" TO "ActivityField_pkey";
ALTER TABLE "ActivityField" RENAME CONSTRAINT "TournamentField_tournamentId_fkey" TO "ActivityField_activityId_fkey";
ALTER TABLE "Division" RENAME CONSTRAINT "Division_tournamentId_fkey" TO "Division_activityId_fkey";
ALTER TABLE "Event" RENAME CONSTRAINT "Event_seasonId_fkey" TO "Event_tournamentId_fkey";

-- Index renames (index names are unique per-schema, not per-table, so order
-- matters here too - free "Tournament_slug_key" before reusing it)
ALTER INDEX "Tournament_slug_key" RENAME TO "Activity_slug_key";
ALTER INDEX "Season_slug_key" RENAME TO "Tournament_slug_key";
ALTER INDEX "Season_tournamentId_idx" RENAME TO "Tournament_activityId_idx";
ALTER INDEX "Division_tournamentId_slug_key" RENAME TO "Division_activityId_slug_key";
ALTER INDEX "TournamentField_tournamentId_key_key" RENAME TO "ActivityField_activityId_key_key";
ALTER INDEX "Event_seasonId_idx" RENAME TO "Event_tournamentId_idx";
ALTER INDEX "Event_seasonId_slug_key" RENAME TO "Event_tournamentId_slug_key";
ALTER INDEX "Event_seasonId_externalId_key" RENAME TO "Event_tournamentId_externalId_key";

-- New top-level Season table (exactly 3 rows: Season 1/2/3)
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

INSERT INTO "Season" ("id", "name", "slug", "order") VALUES
  ('season-1', 'Season 1', 'season-1', 1),
  ('season-2', 'Season 2', 'season-2', 2),
  ('season-3', 'Season 3', 'season-3', 3);

-- Assign every existing Activity to its Season, then make it required
ALTER TABLE "Activity" ADD COLUMN "seasonId" TEXT;

UPDATE "Activity" SET "seasonId" = 'season-1'
  WHERE "name" IN ('JV Volleyball', 'Varsity Volleyball', 'Swimming', 'Golf', 'Academic Games');
UPDATE "Activity" SET "seasonId" = 'season-2'
  WHERE "name" IN ('JV Basketball', 'Varsity Basketball', 'JV Soccer', 'Varsity Soccer', 'Tennis', 'Cross Country', 'Wrestling', 'Senior Fine Arts');
UPDATE "Activity" SET "seasonId" = 'season-3'
  WHERE "name" IN ('Badminton', 'Track & Field', 'Baseball', 'Softball', 'Speech & Debate');

ALTER TABLE "Activity" ALTER COLUMN "seasonId" SET NOT NULL;
CREATE INDEX "Activity_seasonId_idx" ON "Activity"("seasonId");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
