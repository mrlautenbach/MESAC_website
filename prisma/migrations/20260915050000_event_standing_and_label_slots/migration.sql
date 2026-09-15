-- Two more ways a schedule row can leave a side pending, alongside the
-- existing game-outcome slot (homeSourceEventId/homeSourceOutcome):
--   - a final-standings position within the event's own division (e.g. a
--     placement bracket seeded "1st" vs "4th")
--   - a free-text placeholder for an opponent not yet in the database
--     ("Local"), or a bare "TBD" for none
ALTER TABLE "Event" ADD COLUMN "homeSourceStanding" INTEGER;
ALTER TABLE "Event" ADD COLUMN "awaySourceStanding" INTEGER;
ALTER TABLE "Event" ADD COLUMN "homeSourceLabel" TEXT;
ALTER TABLE "Event" ADD COLUMN "awaySourceLabel" TEXT;
