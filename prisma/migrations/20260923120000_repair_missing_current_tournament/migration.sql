-- Creating a tournament used to un-mark every current tournament for its
-- activity *after* inserting the new one, so the new one ended up not
-- current either and the activity had no current tournament at all. For
-- every activity left in that state, mark as current the tournament the
-- admin pages were already showing as current: non-archived first, then
-- newest start date.
UPDATE "Tournament" t
SET "isCurrent" = true
FROM (
  SELECT DISTINCT ON ("activityId") "id"
  FROM "Tournament"
  WHERE "activityId" NOT IN (SELECT "activityId" FROM "Tournament" WHERE "isCurrent" = true)
  ORDER BY "activityId", "archived" ASC, "startDate" DESC
) pick
WHERE t."id" = pick."id";
