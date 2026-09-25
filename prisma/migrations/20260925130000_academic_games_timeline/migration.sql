-- Academic Games' timeline: an activity flag for its own schedule view, and
-- an end time so items can show as ranges ("9:25am - 10:15am").
ALTER TABLE "Activity" ADD COLUMN "usesAcademicFormat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "endDate" TIMESTAMP(3);

UPDATE "Activity" SET "usesAcademicFormat" = true WHERE LOWER("name") = 'academic games';
