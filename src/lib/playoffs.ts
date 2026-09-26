import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { computeStandings, computeLowScoreTeamStandings } from "@/lib/standings";

type Db = Prisma.TransactionClient | typeof prisma;

// Win/loss outcomes for a CSV-imported dual match. LOW_SCORE tournaments
// (e.g. golf) never get an Outcome written - same as the manual edit form,
// which only shows the outcome selector for WIN_LOSS - so a game's winner
// there is always determined directly from the scores (see getEventOutcome)
// rather than from a stored Outcome enum.
export function computeOutcomes(
  scoringType: "WIN_LOSS" | "LOW_SCORE" | "NONE",
  homeScore: number | null,
  awayScore: number | null
): { home: "WIN" | "LOSS" | "DRAW" | null; away: "WIN" | "LOSS" | "DRAW" | null } {
  if (scoringType !== "WIN_LOSS" || homeScore === null || awayScore === null) return { home: null, away: null };
  if (homeScore === awayScore) return { home: "DRAW", away: "DRAW" };
  return homeScore > awayScore ? { home: "WIN", away: "LOSS" } : { home: "LOSS", away: "WIN" };
}

// The decided winner/loser of a completed dual match, or null if it isn't
// determinable yet (not played, missing a score, or a tie with no
// tiebreaker) - used to advance a bracket built from game-id references
// ("winner of G3 plays winner of G4").
export async function getEventOutcome(
  tx: Db,
  eventId: string
): Promise<{ winnerSchoolId: string; loserSchoolId: string } | null> {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { results: true, participants: true, tournament: { include: { activity: true } } },
  });
  if (!event || event.status !== "COMPLETED") return null;

  const home = event.participants.find((p) => p.isHome);
  const away = event.participants.find((p) => !p.isHome);
  if (!home || !away) return null;
  const homeResult = event.results.find((r) => r.schoolId === home.schoolId);
  const awayResult = event.results.find((r) => r.schoolId === away.schoolId);
  if (!homeResult || homeResult.score === null || !awayResult || awayResult.score === null) return null;
  if (homeResult.score === awayResult.score) return null;

  const scoringType = event.tournament.activity.scoringType;
  const homeWins = scoringType === "LOW_SCORE" ? homeResult.score < awayResult.score : homeResult.score > awayResult.score;
  return homeWins
    ? { winnerSchoolId: home.schoolId, loserSchoolId: away.schoolId }
    : { winnerSchoolId: away.schoolId, loserSchoolId: home.schoolId };
}

// Puts `schoolId` (or nobody) on one side of a bracket game. Brackets are
// worked out again whenever a result changes, so a corrected score moves
// the right team through rather than leaving the old one in place: when a
// side's team changes, the result that belonged to the old matchup is
// cleared and the game goes back to Scheduled. Returns whether it changed.
async function setSlot(tx: Db, eventId: string, isHome: boolean, schoolId: string | null): Promise<boolean> {
  const participants = await tx.eventParticipant.findMany({ where: { eventId } });
  const current = participants.find((p) => p.isHome === isHome) ?? null;
  if ((current?.schoolId ?? null) === schoolId) return false;
  // A school can only be in a game once - if it's already on the other side
  // (e.g. "1st vs ABA" and ABA finishes first), an admin has to sort it out.
  if (schoolId && participants.some((p) => p.isHome !== isHome && p.schoolId === schoolId)) return false;

  if (current) {
    await tx.eventParticipant.delete({ where: { id: current.id } });
    await tx.result.deleteMany({ where: { eventId, schoolId: current.schoolId } });
    await tx.result.updateMany({ where: { eventId }, data: { score: null, outcome: null } });
    await tx.eventSet.deleteMany({ where: { eventId } });
    await tx.event.update({ where: { id: eventId }, data: { status: "SCHEDULED" } });
  }
  if (schoolId) {
    await tx.eventParticipant.create({ data: { eventId, schoolId, isHome } });
    await tx.result.upsert({
      where: { eventId_schoolId: { eventId, schoolId } },
      create: { eventId, schoolId },
      update: {},
    });
  }
  return true;
}

// Call after a game's result (or status) changes - puts its winner and
// loser into any game waiting on them ("winner of this game plays..."), or
// empties those slots again if it's no longer decided. A slot that changes
// passes the change on down the bracket.
export async function resolvePlayoffSlots(tx: Db, sourceEventId: string, seen = new Set<string>()) {
  if (seen.has(sourceEventId)) return;
  seen.add(sourceEventId);
  const outcome = await getEventOutcome(tx, sourceEventId);

  const dependents = await tx.event.findMany({
    where: { OR: [{ homeSourceEventId: sourceEventId }, { awaySourceEventId: sourceEventId }] },
  });
  const pick = (which: "WINNER" | "LOSER") => (outcome ? (which === "WINNER" ? outcome.winnerSchoolId : outcome.loserSchoolId) : null);
  for (const dep of dependents) {
    let changed = false;
    if (dep.homeSourceEventId === sourceEventId && dep.homeSourceOutcome) {
      changed = (await setSlot(tx, dep.id, true, pick(dep.homeSourceOutcome))) || changed;
    }
    if (dep.awaySourceEventId === sourceEventId && dep.awaySourceOutcome) {
      changed = (await setSlot(tx, dep.id, false, pick(dep.awaySourceOutcome))) || changed;
    }
    if (changed) await resolvePlayoffSlots(tx, dep.id, seen);
  }
}

// Call after any game's result (or status) changes - fills in a placement
// slot ("4th place plays...") for every division whose group-stage games
// (every event that isn't itself a pending-or-resolved bracket slot) are all
// decided, and empties it again if they no longer are (a game set back to
// Scheduled) or the standings have moved. Unlike resolvePlayoffSlots this isn't scoped to one source event,
// since a standings position depends on every game in the division, not one
// game in particular - so it re-checks every division with a pending slot.
//
// computeStandings/computeLowScoreTeamStandings always read through the
// module-level `prisma` client, not whatever `Db` is passed in here - so
// this must only ever be called with `prisma` itself, after any transaction
// that changed the underlying games has already committed. Calling it with
// an open transaction's `tx` would read stale, pre-commit standings.
export async function resolveStandingSlots(tx: Db, tournamentId: string) {
  const pending = await tx.event.findMany({
    where: {
      tournamentId,
      OR: [{ homeSourceStanding: { not: null } }, { awaySourceStanding: { not: null } }],
    },
  });
  if (pending.length === 0) return;

  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: { activity: true } });
  if (!tournament) return;
  const { scoringType, winPoints, drawPoints, lossPoints } = tournament.activity;

  const divisionIds = new Set(pending.map((e) => e.divisionId));
  const standingsByDivision = new Map<string | null, { schoolId: string }[]>();

  for (const divisionId of divisionIds) {
    // Not final yet: some non-bracket game in this division is still
    // scheduled, so the table could still change.
    const stillScheduled = await tx.event.count({
      where: {
        tournamentId,
        divisionId,
        status: "SCHEDULED",
        homeSourceEventId: null,
        awaySourceEventId: null,
        homeSourceStanding: null,
        awaySourceStanding: null,
        homeSourceLabel: null,
        awaySourceLabel: null,
      },
    });
    if (stillScheduled > 0) continue;

    const rows =
      scoringType === "LOW_SCORE"
        ? await computeLowScoreTeamStandings(tournamentId, divisionId, true)
        : await computeStandings(tournamentId, { winPoints, drawPoints, lossPoints }, divisionId, true);
    standingsByDivision.set(divisionId, rows);
  }

  for (const event of pending) {
    // No table yet (the group stage isn't finished) empties the slot.
    const rows = standingsByDivision.get(event.divisionId);
    const at = (position: number) => rows?.[position - 1]?.schoolId ?? null;
    let changed = false;
    if (event.homeSourceStanding) changed = (await setSlot(tx, event.id, true, at(event.homeSourceStanding))) || changed;
    if (event.awaySourceStanding) changed = (await setSlot(tx, event.id, false, at(event.awaySourceStanding))) || changed;
    if (changed) await resolvePlayoffSlots(tx, event.id);
  }
}

// Call right after pointing a new/updated event's slot at another game - in
// case that source game is already decided (e.g. the bracket is uploaded
// after pool play already finished), so the slot doesn't sit pending
// forever waiting for a result change that will never come.
export async function tryFillFromExistingSource(
  tx: Db,
  eventId: string,
  isHome: boolean,
  sourceEventId: string,
  sourceOutcome: "WINNER" | "LOSER"
) {
  const outcome = await getEventOutcome(tx, sourceEventId);
  if (!outcome) return;
  const schoolId = sourceOutcome === "WINNER" ? outcome.winnerSchoolId : outcome.loserSchoolId;
  if (await setSlot(tx, eventId, isHome, schoolId)) await resolvePlayoffSlots(tx, eventId);
}
