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
