-- The set-scores editor used to start every game with a 0-0 row, and saving
-- the event form stored it as a real set - so an unplayed game could show
-- "Sets 0-0". A 0-0 set is never a played one; remove them, then renumber
-- whatever sets a game has left so they still run 1, 2, 3...
DELETE FROM "EventSet" WHERE "homeScore" = 0 AND "awayScore" = 0;

-- Out of the way first, so the renumbering can't collide with a set number
-- that's still taken (setNumber is unique per game).
UPDATE "EventSet" SET "setNumber" = "setNumber" + 1000;

UPDATE "EventSet" AS s
SET "setNumber" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "setNumber") AS rn
  FROM "EventSet"
) AS n
WHERE s.id = n.id;
