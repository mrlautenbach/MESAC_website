// The Academic Bowl: a round robin between teams (a school and a colour,
// "ASDubai Blue") in each division, then seeded finals - Quarterfinals 1v8,
// 4v5, 2v7, 3v6, Semifinals between their winners, a Consolation round for
// the Semifinal losers and the Final.

export type BowlStage = "ROUND_ROBIN" | "QUARTERFINAL" | "SEMIFINAL" | "CONSOLATION" | "FINAL";

export const FINALS_STAGES: { stage: Exclude<BowlStage, "ROUND_ROBIN">; code: string; label: string; games: number }[] = [
  { stage: "QUARTERFINAL", code: "QF", label: "Quarterfinal", games: 4 },
  { stage: "SEMIFINAL", code: "SF", label: "Semifinal", games: 2 },
  { stage: "CONSOLATION", code: "Consolation", label: "Consolation", games: 1 },
  { stage: "FINAL", code: "Final", label: "Final", games: 1 },
];

// A CSV's round cell: a round-robin round ("7"), or a finals game - "QF2",
// "Quarterfinal 2", "SF1", "Semi Final 1", "Consolation", "Final".
export function parseRound(raw: string): { stage: BowlStage; number: number } | null {
  const text = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (/^\d{1,3}$/.test(text)) {
    const n = Number(text);
    return n >= 1 ? { stage: "ROUND_ROBIN", number: n } : null;
  }
  const numbered = text.match(/^(qf|quarter ?finals?|sf|semi ?finals?)\s*(\d)$/);
  if (numbered) {
    const stage = numbered[1].startsWith("q") ? "QUARTERFINAL" : "SEMIFINAL";
    const n = Number(numbered[2]);
    const max = stage === "QUARTERFINAL" ? 4 : 2;
    return n >= 1 && n <= max ? { stage, number: n } : null;
  }
  if (/^(consolation|consolation round|3rd place|third place)$/.test(text)) return { stage: "CONSOLATION", number: 1 };
  if (/^(final|finals|championship)$/.test(text)) return { stage: "FINAL", number: 1 };
  return null;
}

// "QF2", "SF1", "Consolation", "Final" - how a finals game is referred to.
export function gameCode(stage: BowlStage, number: number): string {
  if (stage === "ROUND_ROBIN") return String(number);
  const info = FINALS_STAGES.find((s) => s.stage === stage)!;
  return info.games > 1 ? `${info.code}${number}` : info.code;
}

// "Round 7", "Quarterfinal 2", "Final".
export function gameLabel(stage: BowlStage, number: number): string {
  if (stage === "ROUND_ROBIN") return `Round ${number}`;
  const info = FINALS_STAGES.find((s) => s.stage === stage)!;
  return info.games > 1 ? `${info.label} ${number}` : info.label;
}

// A finals slot that isn't a team yet: "seed 3" (the round robin's third
// place), "winner QF1", "loser SF2" - normalized, or null if it isn't one.
export function parseSource(raw: string): string | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const seed = text.match(/^(?:seed|#)\s*(\d{1,2})$/) ?? text.match(/^(\d{1,2})(?:st|nd|rd|th)(?: seed| place)?$/);
  if (seed) return Number(seed[1]) >= 1 ? `seed ${Number(seed[1])}` : null;
  const game = text.match(/^(winner|loser|w|l)(?: of)? (.+)$/);
  if (game) {
    const round = parseRound(game[2]);
    if (!round || round.stage === "ROUND_ROBIN") return null;
    return `${game[1].startsWith("w") ? "winner" : "loser"} ${gameCode(round.stage, round.number)}`;
  }
  return null;
}

// "Seed 3", "Winner QF1" - a finals slot as the schedule shows it.
export function sourceLabel(source: string): string {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

type SchoolKey = { id: string; name: string; code: string | null };

// A team as the sheets write it - "ASDubai Blue", "ABA - Red", "AES Red",
// or a school on its own - split into its school and its colour. "AS"
// before a school's code is dropped, so "ASDubai" and "ASDoha" find the
// schools coded Dubai and Doha.
export function parseTeamName<S extends SchoolKey>(
  raw: string,
  schoolByKey: Map<string, S>
): { school: S; name: string } | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const find = (part: string) => {
    const key = part.trim().toLowerCase();
    return schoolByKey.get(key) ?? (key.startsWith("as") ? schoolByKey.get(key.slice(2).trim()) : undefined);
  };
  const whole = find(text);
  if (whole) return { school: whole, name: "" };
  // The colour is the last word; anything longer ("Dubai American Academy
  // Red") still finds the school from everything before it.
  const words = text.split(/[\s-]+/).filter(Boolean);
  if (words.length < 2) return null;
  const colour = words.at(-1)!;
  const school = find(text.slice(0, text.length - colour.length).replace(/[\s-]+$/, ""));
  return school ? { school, name: colour.charAt(0).toUpperCase() + colour.slice(1).toLowerCase() } : null;
}

// "Dubai Blue", "AES Red" - the school's short code and the colour.
export function teamLabel(team: { name: string; school: { code: string | null; name: string } }): string {
  const school = team.school.code || team.school.name;
  return team.name ? `${school} ${team.name}` : school;
}

// ── Standings and the finals bracket ───────────────────────────────────

type ScoredGame = {
  id: string;
  stage: BowlStage;
  number: number;
  teamAId: string | null;
  teamBId: string | null;
  sourceA: string | null;
  sourceB: string | null;
  scoreA: number | null;
  scoreB: number | null;
};

export type BowlStandingsRow<T> = {
  team: T;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  place: number;
};

const isScored = (g: ScoredGame) => g.teamAId !== null && g.teamBId !== null && g.scoreA !== null && g.scoreB !== null;

// The round robin's table: most wins first, then most points scored (the
// tie-break), and teams still level share a place. Only round-robin games
// count - the finals don't change the seeding.
export function bowlStandings<T extends { id: string; label: string }>(teams: T[], games: ScoredGame[]): BowlStandingsRow<T>[] {
  const rows = new Map(teams.map((team) => [team.id, { team, played: 0, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, place: 0 }]));
  for (const g of games) {
    if (g.stage !== "ROUND_ROBIN" || !isScored(g)) continue;
    const a = rows.get(g.teamAId!);
    const b = rows.get(g.teamBId!);
    if (!a || !b) continue;
    for (const [row, own, other] of [
      [a, g.scoreA!, g.scoreB!],
      [b, g.scoreB!, g.scoreA!],
    ] as const) {
      row.played++;
      row.pointsFor += own;
      row.pointsAgainst += other;
      if (own > other) row.wins++;
      else if (own < other) row.losses++;
      else row.draws++;
    }
  }
  const list = [...rows.values()].sort(
    (x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor || x.team.label.localeCompare(y.team.label)
  );
  for (const row of list) row.place = list.findIndex((r) => r.wins === row.wins && r.pointsFor === row.pointsFor) + 1;
  return list;
}

// Seeds only count once every round-robin game has its score.
export function roundRobinComplete(games: ScoredGame[]): boolean {
  const robin = games.filter((g) => g.stage === "ROUND_ROBIN");
  return robin.length > 0 && robin.every(isScored);
}

export function gameResult(game: ScoredGame): { winner: string; loser: string } | null {
  if (!isScored(game) || game.scoreA === game.scoreB) return null;
  return game.scoreA! > game.scoreB!
    ? { winner: game.teamAId!, loser: game.teamBId! }
    : { winner: game.teamBId!, loser: game.teamAId! };
}

// Fills one division's finals slots from where they come from: "seed 3"
// from the finished round robin's standings (in order - seed 1 is the top
// row), "winner QF1" / "loser SF2" from that game's score. Worked through
// in bracket order so a Semifinal sees its Quarterfinals' new teams. A slot
// whose source isn't decided yet goes back to empty; a game whose teams
// change loses a score that belonged to the old matchup. Returns only the
// games that change.
export function resolveFinals(
  games: ScoredGame[],
  seeds: string[] | null
): { id: string; teamAId: string | null; teamBId: string | null; scoreA: number | null; scoreB: number | null }[] {
  const order: BowlStage[] = ["QUARTERFINAL", "SEMIFINAL", "CONSOLATION", "FINAL"];
  const finals = games
    .filter((g) => g.stage !== "ROUND_ROBIN")
    .map((g) => ({ ...g }))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.number - b.number);
  const byCode = new Map(finals.map((g) => [gameCode(g.stage, g.number), g]));
  const changed = new Set<string>();

  const fill = (source: string | null, current: string | null): string | null => {
    if (!source) return current; // a named team stays as it is
    const seed = source.match(/^seed (\d+)$/);
    if (seed) return seeds?.[Number(seed[1]) - 1] ?? null;
    const [which, code] = source.split(" ");
    const from = byCode.get(code);
    const result = from ? gameResult(from) : null;
    return result ? (which === "winner" ? result.winner : result.loser) : null;
  };

  for (const game of finals) {
    const teamAId = fill(game.sourceA, game.teamAId);
    const teamBId = fill(game.sourceB, game.teamBId);
    if (teamAId === game.teamAId && teamBId === game.teamBId) continue;
    game.teamAId = teamAId;
    game.teamBId = teamBId;
    game.scoreA = null;
    game.scoreB = null;
    changed.add(game.id);
  }
  return finals
    .filter((g) => changed.has(g.id))
    .map(({ id, teamAId, teamBId, scoreA, scoreB }) => ({ id, teamAId, teamBId, scoreA, scoreB }));
}
