import { prisma } from "@/lib/prisma";

export type StandingsRow = {
  schoolId: string;
  schoolName: string;
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

function eventWhere(seasonId: string, divisionId?: string | null) {
  return divisionId ? { seasonId, divisionId } : { seasonId };
}

const FORM_LETTER: Record<string, "W" | "L" | "D"> = { WIN: "W", LOSS: "L", DRAW: "D" };

// Standings are always derived from the Results table at read time (there is
// no cached/stored standings row to go stale) so they're accurate the moment
// a result is saved, with no extra step for editors. `divisionId` narrows to
// one Girls/Boys division within the season when the tournament has them.
export async function computeStandings(seasonId: string, divisionId?: string | null): Promise<StandingsRow[]> {
  const season = await prisma.season.findUnique({ where: { id: seasonId }, include: { tournament: true } });
  if (!season) return [];

  const events = await prisma.event.findMany({
    where: eventWhere(seasonId, divisionId),
    orderBy: { date: "asc" },
    include: { results: { include: { school: true } } },
  });

  const table = new Map<string, StandingsRow>();
  const formHistory = new Map<string, ("W" | "L" | "D")[]>();

  for (const event of events) {
    const decided = event.results.filter((r) => r.outcome !== null);
    for (const result of decided) {
      let row = table.get(result.schoolId);
      if (!row) {
        row = {
          schoolId: result.schoolId,
          schoolName: result.school.name,
          logoUrl: result.school.logoUrl,
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

      row.played += 1;
      if (result.score !== null) row.totalScore += result.score;
      row.against += decided
        .filter((r) => r.schoolId !== result.schoolId)
        .reduce((sum, r) => sum + (r.score ?? 0), 0);

      if (result.outcome === "WIN") {
        row.wins += 1;
        row.points += season.tournament.winPoints;
      } else if (result.outcome === "DRAW") {
        row.draws += 1;
        row.points += season.tournament.drawPoints;
      } else if (result.outcome === "LOSS") {
        row.losses += 1;
        row.points += season.tournament.lossPoints;
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

  return Array.from(table.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.schoolName.localeCompare(b.schoolName);
  });
}

export type LowScoreTeamRow = {
  schoolId: string;
  schoolName: string;
  logoUrl: string | null;
  played: number;
  totalScore: number;
  avgScore: number;
};

// For LOW_SCORE seasons (e.g. golf): ranked by lowest aggregate team score,
// not win/loss points.
export async function computeLowScoreTeamStandings(
  seasonId: string,
  divisionId?: string | null
): Promise<LowScoreTeamRow[]> {
  const results = await prisma.result.findMany({
    where: { event: eventWhere(seasonId, divisionId), score: { not: null } },
    include: { school: true },
  });

  const table = new Map<string, LowScoreTeamRow>();
  for (const result of results) {
    let row = table.get(result.schoolId);
    if (!row) {
      row = {
        schoolId: result.schoolId,
        schoolName: result.school.name,
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
  athleteName: string;
  played: number;
  totalScore: number;
  avgScore: number;
};

// For LOW_SCORE seasons: named-individual standings aggregated across every
// event in the season (or division), ranked by lowest average score.
export async function computeIndividualStandings(
  seasonId: string,
  divisionId?: string | null
): Promise<IndividualStandingsRow[]> {
  const entries = await prisma.individualResult.findMany({
    where: { event: eventWhere(seasonId, divisionId) },
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
