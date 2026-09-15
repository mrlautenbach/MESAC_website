-- Gate the "Live results" feature per activity instead of showing it for
-- every activity unconditionally.
ALTER TABLE "Activity" ADD COLUMN "usesLiveResults" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Activity" SET "usesLiveResults" = true
WHERE "name" IN ('Swimming', 'Track & Field', 'Wrestling', 'Cross Country');
