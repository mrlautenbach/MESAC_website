-- Games at the same time list in game order (G1, G2, ... G10) instead of
-- whatever order the database happens to return them in.
ALTER TABLE "Event" ADD COLUMN "gameNumber" INTEGER;

-- Same rule as gameNumberOf() in src/lib/eventOrder.ts: the first run of
-- digits, capped at 9 of them so it always fits an INTEGER.
UPDATE "Event"
SET "gameNumber" = LEFT(substring("externalId" from '[0-9]+'), 9)::INTEGER
WHERE "externalId" ~ '[0-9]';
