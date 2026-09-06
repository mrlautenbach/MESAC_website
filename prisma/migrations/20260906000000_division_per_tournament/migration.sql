-- Division becomes tournament-scoped: a division with tournamentId = null
-- is the activity's stored "default" template (used only to pre-fill a
-- newly created tournament, see createTournamentAction); a division with
-- tournamentId set is that one tournament's own, independently editable
-- copy - editing it never touches the default template or any other
-- edition of the same activity.
--
-- Existing Division rows have no tournamentId, so they become the default
-- template as-is. This migration also backfills a full, independent copy
-- for every tournament that already exists, and re-points its existing
-- events/team-photos onto the new copies so nothing already scheduled
-- changes which division it's shown under.

ALTER TABLE "Division" ADD COLUMN "tournamentId" TEXT;

ALTER TABLE "Division" ADD CONSTRAINT "Division_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Division_activityId_slug_key";
CREATE UNIQUE INDEX "Division_activityId_tournamentId_slug_key" ON "Division"("activityId", "tournamentId", "slug");

-- Backfill: one full copy of each activity's template divisions per
-- existing tournament of that activity.
INSERT INTO "Division" (id, "activityId", "tournamentId", name, slug, "createdAt")
SELECT gen_random_uuid()::text, d."activityId", t.id, d.name, d.slug, now()
FROM "Division" d
JOIN "Tournament" t ON t."activityId" = d."activityId"
WHERE d."tournamentId" IS NULL;

-- Re-point existing events from the template division onto that specific
-- tournament's new copy.
UPDATE "Event" e
SET "divisionId" = copy.id
FROM "Division" tmpl, "Division" copy
WHERE e."divisionId" = tmpl.id
  AND tmpl."tournamentId" IS NULL
  AND copy."activityId" = tmpl."activityId"
  AND copy.slug = tmpl.slug
  AND copy."tournamentId" = e."tournamentId";

-- Re-point existing team-photo slots the same way.
UPDATE "TeamPhoto" tp
SET "divisionId" = copy.id
FROM "Division" tmpl, "Division" copy
WHERE tp."divisionId" = tmpl.id
  AND tmpl."tournamentId" IS NULL
  AND copy."activityId" = tmpl."activityId"
  AND copy.slug = tmpl.slug
  AND copy."tournamentId" = tp."tournamentId";
