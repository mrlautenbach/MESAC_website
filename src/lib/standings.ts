import { prisma } from "@/lib/prisma";

export type StandingsRow = {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  logoUrl: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  totalScore: number;
  /** Sum of every opponent's score in the same event, for a For/Against/Diff
   * column. Only meaningful for head-to-head (two-participant) events - for
   * a multi-school meet it sums across every other participant, which is
   * still a reasonable "against" figure but not a classic sports stat. */
  against: number;
  /** Last 5 results, oldest first (e.g. ["W","W","L","D","W"]). */
  form: ("W" | "L" | "D")[];
};

// `excludeBracketGames` drops any event with a pending-or-resolved playoff
// slot on either side (game-outcome, standings-seeded, or a free-text
// placeholder) - used only when computing the standings a placement bracket
// seeds itself from, so a completed bracket game can't feed back into the
// table that seeded it. Every other caller (the public standings page)
// leaves this off, unchanged from before bracket seeding existed.
function eventWhere(tournamentId: string, divisionId?: string | null, excludeBracketGames?: boolean) {
  return {
    tournamentId,
    ...(divisionId ? { divisionId } : {}),
    ...(excludeBracketGames
      ? {
          homeSourceEventId: null,
          awaySourceEventId: null,
          homeSourceStanding: null,
          awaySourceStanding: null,
          homeSourceLabel: null,
          awaySourceLabel: null,
        }
      : {}),
  };
}

type Outcome = "WIN" | "LOSS" | "DRAW";
type DecidedResult = { schoolId: string; score: number | null; outcome: Outcome };
type StandingsEvent = {
  status: string;
  results: { schoolId: string; score: number | null; outcome: Outcome | null }[];
  participants: { schoolId: string; isHome: boolean }[];
  sets: { homeScore: number; awayScore: number }[];
};

const OPPOSITE: Record<Outcome, Outcome> = { WIN: "LOSS", LOSS: "WIN", DRAW: "DRAW" };
const isDecided = <R extends { outcome: Outcome | null }>(r: R): r is R & { outcome: Outcome } => r.outcome !== null;

// Each school's result in a game that counts for the table. A two-team
// game counts for both teams as soon as it's decided for either: when only
// one side's outcome was picked (e.g. the winner's "Win"), the other side
// gets the opposite, and a completed game with both scores but no outcome
// picked at all is decided by the scores (for volleyball, sets won - counted
// from the set scores when "sets won" was left blank). So the loser always
// appears, with its loss and the points it scored.
function decidedResults(event: StandingsEvent): DecidedResult[] {
  if (event.participants.length !== 2) return event.results.filter(isDecided);

  const sides = event.participants.map((p) => {
    const result = event.results.find((r) => r.schoolId === p.schoolId);
    const setsWon = event.sets.filter((s) => (p.isHome ? s.homeScore > s.awayScore : s.awayScore > s.homeScore)).length;
    return {
      schoolId: p.schoolId,
      score: result?.score ?? null,
      outcome: result?.outcome ?? null,
      // Only for deciding the game - For/Against still use the stored score.
      decidingScore: result?.score ?? (event.sets.length > 0 ? setsWon : null),
    };
  });
  const [a, b] = sides;
  if (a.outcome && !b.outcome) b.outcome = OPPOSITE[a.outcome];
  else if (!a.outcome && b.outcome) a.outcome = OPPOSITE[b.outcome];
  else if (!a.outcome && !b.outcome && event.status === "COMPLETED" && a.decidingScore !== null && b.decidingScore !== null) {
    a.outcome = a.decidingScore === b.decidingScore ? "DRAW" : a.decidingScore > b.decidingScore ? "WIN" : "LOSS";
    b.outcome = OPPOSITE[a.outcome];
  }
  return sides.filter(isDecided).map(({ schoolId, score, outcome }) => ({ schoolId, score, outcome }));
}

const FORM_LETTER: Record<string, "W" | "L" | "D"> = { WIN: "W", LOSS: "L", DRAW: "D" };

// Standings are always derived from the Results table at read time (there is
// no cached/stored standings row to go stale) so they're accurate the moment
// a result is saved, with no extra step for editors. `divisionId` narrows to
// one Girls/Boys division within the tournament when the activity has them.
export async function computeStandings(
  tournamentId: string,
  // The caller already holds the tournament's Activity - taking the three
  // point values as an argument saves re-fetching the tournament and its
  // activity on every results-page render just to read them.
  scoring: { winPoints: number; drawPoints: number; lossPoints: number },
  divisionId?: string | null,
  excludeBracketGames?: boolean
): Promise<StandingsRow[]> {
  const events = await prisma.event.findMany({
    where: eventWhere(tournamentId, divisionId, excludeBracketGames),
    orderBy: { date: "asc" },
    select: {
      status: true,
      results: { select: { schoolId: true, score: true, outcome: true } },
      participants: { select: { schoolId: true, isHome: true, school: { select: { name: true, slug: true, logoUrl: true } } } },
      sets: { select: { homeScore: true, awayScore: true } },
    },
  });

  const table = new Map<string, StandingsRow>();
  const formHistory = new Map<string, ("W" | "L" | "D")[]>();

  for (const event of events) {
    // Volleyball-style (usesSetScores) events record set wins as the
    // Result.score, not raw points - when set scores have been entered,
    // substitute each side's summed set points for the For/Against columns.
    const pointsBySchoolId = new Map<string, number>();
    if (event.sets.length > 0) {
      const home = event.participants.find((p) => p.isHome);
      const away = event.participants.find((p) => !p.isHome);
      if (home) pointsBySchoolId.set(home.schoolId, event.sets.reduce((sum, s) => sum + s.homeScore, 0));
      if (away) pointsBySchoolId.set(away.schoolId, event.sets.reduce((sum, s) => sum + s.awayScore, 0));
    }

    const decided = decidedResults(event);
    for (const result of decided) {
      let row = table.get(result.schoolId);
      if (!row) {
        const school = event.participants.find((p) => p.schoolId === result.schoolId)?.school;
        if (!school) continue;
        row = {
          schoolId: result.schoolId,
          schoolName: school.name,
          schoolSlug: school.slug,
          logoUrl: school.logoUrl,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          totalScore: 0,
          against: 0,
          form: [],
        };
        table.set(result.schoolId, row);
      }

      const scoreForTotals = pointsBySchoolId.get(result.schoolId) ?? result.score;

      row.played += 1;
      if (scoreForTotals !== null && scoreForTotals !== undefined) row.totalScore += scoreForTotals;
      row.against += decided
        .filter((r) => r.schoolId !== result.schoolId)
        .reduce((sum, r) => sum + (pointsBySchoolId.get(r.schoolId) ?? r.score ?? 0), 0);

      if (result.outcome === "WIN") {
        row.wins += 1;
        row.points += scoring.winPoints;
      } else if (result.outcome === "DRAW") {
        row.draws += 1;
        row.points += scoring.drawPoints;
      } else if (result.outcome === "LOSS") {
        row.losses += 1;
        row.points += scoring.lossPoints;
      }

      const letter = FORM_LETTER[result.outcome as string];
      const history = formHistory.get(result.schoolId) ?? [];
      history.push(letter);
      formHistory.set(result.schoolId, history);
    }
  }

  for (const row of table.values()) {
    row.form = (formHistory.get(row.schoolId) ?? []).slice(-5);
  }

  // Level on points and wins, the better score difference (points or sets
  // for minus against) goes higher.
  return Array.from(table.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diff = b.totalScore - b.against - (a.totalScore - a.against);
    if (diff !== 0) return diff;
    return a.schoolName.localeCompare(b.schoolName);
  });
}

export type LowScoreTeamRow = {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  logoUrl: string | null;
  played: number;
  totalScore: number;
  avgScore: number;
};

// For LOW_SCORE tournaments (e.g. golf): ranked by lowest aggregate team
// score, not win/loss points.
export async function computeLowScoreTeamStandings(
  tournamentId: string,
  divisionId?: string | null,
  excludeBracketGames?: boolean
): Promise<LowScoreTeamRow[]> {
  const results = await prisma.result.findMany({
    where: { event: eventWhere(tournamentId, divisionId, excludeBracketGames), score: { not: null } },
    include: { school: true },
  });

  const table = new Map<string, LowScoreTeamRow>();
  for (const result of results) {
    let row = table.get(result.schoolId);
    if (!row) {
      row = {
        schoolId: result.schoolId,
        schoolName: result.school.name,
        schoolSlug: result.school.slug,
        logoUrl: result.school.logoUrl,
        played: 0,
        totalScore: 0,
        avgScore: 0,
      };
      table.set(result.schoolId, row);
    }
    row.played += 1;
    row.totalScore += result.score ?? 0;
  }

  return Array.from(table.values())
    .map((row) => ({ ...row, avgScore: row.totalScore / row.played }))
    .sort((a, b) => a.avgScore - b.avgScore || a.schoolName.localeCompare(b.schoolName));
}

export type IndividualStandingsRow = {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  athleteName: string;
  played: number;
  totalScore: number;
  avgScore: number;
};

// For LOW_SCORE tournaments: named-individual standings aggregated across
// every event in the tournament (or division), ranked by lowest average
// score.
export async function computeIndividualStandings(
  tournamentId: string,
  divisionId?: string | null
): Promise<IndividualStandingsRow[]> {
  const entries = await prisma.individualResult.findMany({
    where: { event: eventWhere(tournamentId, divisionId) },
    include: { school: true },
  });

  const table = new Map<string, IndividualStandingsRow>();
  for (const entry of entries) {
    const key = `${entry.schoolId}::${entry.athleteName.trim().toLowerCase()}`;
    let row = table.get(key);
    if (!row) {
      row = {
        schoolId: entry.schoolId,
        schoolName: entry.school.name,
        schoolSlug: entry.school.slug,
        athleteName: entry.athleteName,
        played: 0,
        totalScore: 0,
        avgScore: 0,
      };
      table.set(key, row);
    }
    row.played += 1;
    row.totalScore += entry.score;
  }

  return Array.from(table.values())
    .map((row) => ({ ...row, avgScore: row.totalScore / row.played }))
    .sort((a, b) => a.avgScore - b.avgScore || a.athleteName.localeCompare(b.athleteName));
}
