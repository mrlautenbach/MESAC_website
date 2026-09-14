-- Event.gender was only ever written by the schedule CSV's meet-specific
-- branch, which the combined schedule+program CSV supersedes (gender now
-- lives on MeetProgramEntry, per named event, not per session).
ALTER TABLE "Event" DROP COLUMN "gender";
