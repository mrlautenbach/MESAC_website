// Golf's format, shared by the public pages, the dashboard and the imports:
// a school's six players are seeded 1-6, seeds 1-2 play Flight 1, 3-4 Flight
// 2 and 5-6 Flight 3, and Day 1 is scored in points - higher is better.

export const GOLF_FLIGHTS = [1, 2, 3] as const;
export const GOLF_SEEDS_PER_SCHOOL = 6;

export function flightOf(seed: number): number {
  return Math.ceil(seed / 2);
}

type ScoredPlayer = { id: string; seed: number; points: number | null; schoolId: string };

export type LeaderboardRow<P> = { player: P; place: number | null; tied: boolean };

// One flight's leaderboard: most points first, tied players share a place
// ("2="), and anyone without a score yet goes to the bottom unplaced.
export function flightLeaderboard<P extends ScoredPlayer>(players: P[]): LeaderboardRow<P>[] {
  const scored = players.filter((p) => p.points !== null).sort((a, b) => b.points! - a.points!);
  const unscored = players.filter((p) => p.points === null).sort((a, b) => a.seed - b.seed);
  const rows: LeaderboardRow<P>[] = scored.map((player) => ({
    player,
    place: scored.findIndex((p) => p.points === player.points) + 1,
    tied: scored.filter((p) => p.points === player.points).length > 1,
  }));
  return [...rows, ...unscored.map((player) => ({ player, place: null, tied: false }))];
}

export type SeedingRow<S> = {
  school: S;
  total: number;
  scoresIn: number;
  players: number;
  seed: number;
};

// Team seeding for the match-play event: each school's total is the sum of
// all six players' Day 1 points; the highest total is seed 1 and ties share
// a seed. Until every player has a score the order is only provisional -
// see seedingIsFinal.
export function teamSeeding<S extends { id: string }>(schools: S[], players: ScoredPlayer[]): SeedingRow<S>[] {
  const rows = schools.map((school) => {
    const own = players.filter((p) => p.schoolId === school.id);
    const scored = own.filter((p) => p.points !== null);
    return {
      school,
      total: scored.reduce((sum, p) => sum + p.points!, 0),
      scoresIn: scored.length,
      players: own.length,
      seed: 0,
    };
  });
  rows.sort((a, b) => b.total - a.total);
  for (const row of rows) row.seed = rows.findIndex((r) => r.total === row.total) + 1;
  return rows;
}

export function seedingIsFinal(rows: SeedingRow<unknown>[]): boolean {
  return rows.length > 0 && rows.every((r) => r.players > 0 && r.scoresIn === r.players);
}

// ── Team match play ────────────────────────────────────────────────────

type PairsResult = { winner: "HOME" | "AWAY" | "HALVED" | null };

// A pairs match is worth 1 to the winner, or ½ each when halved.
function pairsPoints(pair: PairsResult, side: "HOME" | "AWAY"): number {
  if (pair.winner === "HALVED") return 0.5;
  return pair.winner === side ? 1 : 0;
}

export type MatchScore = { home: number; away: number; decided: number; total: number; complete: boolean };

export function matchScore(pairs: PairsResult[]): MatchScore {
  const decided = pairs.filter((p) => p.winner !== null);
  return {
    home: decided.reduce((sum, p) => sum + pairsPoints(p, "HOME"), 0),
    away: decided.reduce((sum, p) => sum + pairsPoints(p, "AWAY"), 0),
    decided: decided.length,
    total: pairs.length,
    complete: pairs.length > 0 && decided.length === pairs.length,
  };
}

// 1.5 -> "1½", 0.5 -> "½", 2 -> "2".
export function formatGolfPoints(n: number): string {
  const whole = Math.floor(n);
  const half = n - whole === 0.5;
  return half ? `${whole === 0 ? "" : whole}½` : String(whole);
}

// Tidies the usual ways a match-play margin gets typed: "3UP" -> "3 up",
// "2 & 1" -> "2&1", "as"/"all square" -> "AS". Anything else is kept as typed.
export function normalizeMargin(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const up = text.match(/^(\d+)\s*up$/i);
  if (up) return `${up[1]} up`;
  const andN = text.match(/^(\d+)\s*(?:&|and)\s*(\d+)$/i);
  if (andN) return `${andN[1]}&${andN[2]}`;
  if (/^(as|a\/s|all\s*square|halved)$/i.test(text)) return "AS";
  return text.slice(0, 20);
}

export type TeamStandingsRow<S> = {
  school: S;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  // Pairs-match points across every round - the tie-breaker.
  flightPoints: number;
  points: number;
  place: number;
};

type TeamMatch = { homeSchoolId: string; awaySchoolId: string; pairs: PairsResult[] };

// Standings for the team match play: a school match counts once all three
// of its pairs matches have a result. Ranked by match points (the
// activity's own win/draw/loss points), then by total flight points; schools
// still level share a place.
export function teamStandings<S extends { id: string; name: string }>(
  schools: S[],
  matches: TeamMatch[],
  scoring: { winPoints: number; drawPoints: number; lossPoints: number }
): TeamStandingsRow<S>[] {
  const rows = new Map(
    schools.map((school) => [school.id, { school, played: 0, wins: 0, draws: 0, losses: 0, flightPoints: 0, points: 0, place: 0 }])
  );
  for (const match of matches) {
    const home = rows.get(match.homeSchoolId);
    const away = rows.get(match.awaySchoolId);
    if (!home || !away) continue;
    const score = matchScore(match.pairs);
    home.flightPoints += score.home;
    away.flightPoints += score.away;
    if (!score.complete) continue;
    home.played++;
    away.played++;
    if (score.home > score.away) {
      home.wins++;
      away.losses++;
    } else if (score.away > score.home) {
      away.wins++;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
    }
  }
  const list = [...rows.values()];
  for (const row of list) {
    row.points = row.wins * scoring.winPoints + row.draws * scoring.drawPoints + row.losses * scoring.lossPoints;
  }
  list.sort((a, b) => b.points - a.points || b.flightPoints - a.flightPoints || a.school.name.localeCompare(b.school.name));
  for (const row of list) {
    row.place = list.findIndex((r) => r.points === row.points && r.flightPoints === row.flightPoints) + 1;
  }
  return list;
}

// A school's pair for a flight - its two roster players seeded for it -
// as "First Player & Second Player", or "TBD" before the roster is in.
export function pairName(players: { schoolId: string; seed: number; name: string }[], schoolId: string, flight: number): string {
  const names = players
    .filter((p) => p.schoolId === schoolId && flightOf(p.seed) === flight)
    .sort((a, b) => a.seed - b.seed)
    .map((p) => p.name);
  return names.length > 0 ? names.join(" & ") : "TBD";
}
