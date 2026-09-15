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

async function fillSlot(tx: Db, dependentEventId: string, isHome: boolean, schoolId: string) {
  const existing = await tx.eventParticipant.findFirst({ where: { eventId: dependentEventId, isHome } });
  if (existing) return;
  await tx.eventParticipant.create({ data: { eventId: dependentEventId, schoolId, isHome } });
  await tx.result.upsert({
    where: { eventId_schoolId: { eventId: dependentEventId, schoolId } },
    create: { eventId: dependentEventId, schoolId },
    update: {},
  });
}

// Call after a game's result (or status) changes - fills in any dependent
// playoff slot ("winner of this game plays...") that's now determinable.
// No-op if this game isn't decided yet, or its dependents are already filled.
export async function resolvePlayoffSlots(tx: Db, sourceEventId: string) {
  const outcome = await getEventOutcome(tx, sourceEventId);
  if (!outcome) return;

  const dependents = await tx.event.findMany({
    where: { OR: [{ homeSourceEventId: sourceEventId }, { awaySourceEventId: sourceEventId }] },
  });
  for (const dep of dependents) {
    if (dep.homeSourceEventId === sourceEventId && dep.homeSourceOutcome) {
      const schoolId = dep.homeSourceOutcome === "WINNER" ? outcome.winnerSchoolId : outcome.loserSchoolId;
      await fillSlot(tx, dep.id, true, schoolId);
    }
    if (dep.awaySourceEventId === sourceEventId && dep.awaySourceOutcome) {
      const schoolId = dep.awaySourceOutcome === "WINNER" ? outcome.winnerSchoolId : outcome.loserSchoolId;
      await fillSlot(tx, dep.id, false, schoolId);
    }
  }
}

// Call after any game's result (or status) changes - fills in a placement
// slot ("4th place plays...") for every division whose group-stage games
// (every event that isn't itself a pending-or-resolved bracket slot) are all
// decided, so a position no longer just committed doesn't keep the slot
// pending. Unlike resolvePlayoffSlots this isn't scoped to one source event,
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
    include: { participants: true },
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
    const rows = standingsByDivision.get(event.divisionId);
    if (!rows) continue;
    const home = event.participants.find((p) => p.isHome);
    const away = event.participants.find((p) => !p.isHome);
    if (event.homeSourceStanding && !home) {
      const row = rows[event.homeSourceStanding - 1];
      if (row) await fillSlot(tx, event.id, true, row.schoolId);
    }
    if (event.awaySourceStanding && !away) {
      const row = rows[event.awaySourceStanding - 1];
      if (row) await fillSlot(tx, event.id, false, row.schoolId);
    }
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
  await fillSlot(tx, eventId, isHome, schoolId);
}
