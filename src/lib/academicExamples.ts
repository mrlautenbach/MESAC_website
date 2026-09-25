import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { RUN_BY_FIELD, sortDivisions } from "@/lib/academicGames";
import { FINALS_STAGES, gameCode, teamLabel, type BowlStage } from "@/lib/bowl";

// The downloadable example for the Academic Games schedule upload - a
// complete file that uploads as-is: the tournament's current timeline once
// there is one (so a change is "download, edit, re-upload"), otherwise the
// 2025 schedule's competitions moved onto this tournament's dates, with
// venues still to be filled in left blank.

const HEADER = ["date", "start", "end", "title", "team", "venue", "run_by"];

// [day (1 = the tournament's first day), start, end, title, team, venue, run_by]
type SampleRow = [number, string, string, string, "varsity" | "jv" | "", string, string];

const SAMPLE: SampleRow[] = [
  [1, "08:45", "09:15", "Mystery Challenge (Ice Breaker)", "", "", ""],
  [1, "09:25", "10:15", "Math Challenge", "varsity", "", "AS Dubai"],
  [1, "10:25", "12:50", "Academic Bowl Rounds 1-6 Plus Exhibition", "varsity", "Classrooms", ""],
  [1, "09:25", "11:50", "Academic Bowl Rounds 1-6 Plus Exhibition", "jv", "Classrooms", ""],
  [1, "12:00", "12:50", "Math Challenge", "jv", "", "AS Dubai"],
  [1, "13:45", "14:45", "Humanities Challenge", "varsity", "", ""],
  [1, "14:55", "17:20", "Academic Bowl Rounds 7-12", "varsity", "Classrooms", ""],
  [1, "13:45", "16:05", "Academic Bowl Rounds 7-12", "jv", "Classrooms", ""],
  [1, "16:15", "17:15", "Humanities Challenge", "jv", "", ""],
  [2, "08:45", "10:05", "Engineering Olympiad", "varsity", "", "AS Doha"],
  [2, "10:15", "12:40", "Academic Bowl Rounds 13-18", "varsity", "Classrooms", ""],
  [2, "08:45", "11:10", "Academic Bowl Rounds 13-18", "jv", "Classrooms", ""],
  [2, "11:20", "12:40", "Engineering Olympiad", "jv", "", "AS Doha"],
  [2, "13:30", "14:20", "Current Events Olympiad", "", "", ""],
  [2, "14:30", "16:55", "Academic Bowl Rounds 19-24", "varsity", "Classrooms", ""],
  [2, "14:30", "16:55", "Academic Bowl Rounds 19-24", "jv", "Classrooms", ""],
  [2, "17:05", "17:55", "Geography/Science Challenge", "", "", ""],
  [3, "09:30", "10:20", "Art and Music Olympiad", "", "MPH", "AES"],
  [3, "10:30", "10:50", "Academic Bowl Quarterfinals", "jv", "4 rooms", ""],
  [3, "11:00", "11:20", "Academic Bowl Quarterfinals", "varsity", "4 rooms", ""],
  [3, "11:40", "12:00", "Academic Bowl Semifinals", "jv", "", ""],
  [3, "12:10", "12:30", "Academic Bowl Semifinals", "varsity", "", ""],
  [3, "14:00", "14:20", "Academic Bowl Consolation Round", "jv", "Theater", ""],
  [3, "14:30", "14:50", "Academic Bowl Consolation Round", "varsity", "Theater", ""],
  [3, "15:00", "15:30", "Academic Bowl Final", "jv", "Theater", ""],
  [3, "15:40", "16:10", "Academic Bowl Final", "varsity", "Theater", ""],
];

export async function buildAcademicScheduleExample(tournamentId: string): Promise<{ filename: string; csv: string } | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: {
        orderBy: { date: "asc" },
        include: { fieldValues: { where: { field: { key: RUN_BY_FIELD.key } } } },
      },
    },
  });
  if (!tournament || !tournament.activity.usesAcademicFormat) return null;
  const filename = `${tournament.slug}-schedule.csv`;

  if (tournament.events.length > 0) {
    // In time order, Varsity before JV at the same time.
    const rank = new Map(sortDivisions(tournament.divisions).map((d, i) => [d.id, i]));
    const divisionName = new Map(tournament.divisions.map((d) => [d.id, d.name]));
    const rankOf = (id: string | null) => (id ? (rank.get(id) ?? rank.size) + 1 : 0);
    const events = [...tournament.events].sort(
      (a, b) => a.date.getTime() - b.date.getTime() || rankOf(a.divisionId) - rankOf(b.divisionId)
    );
    const rows = events.map((e) => [
      format(e.date, "yyyy-MM-dd"),
      format(e.date, "HH:mm"),
      e.endDate ? format(e.endDate, "HH:mm") : "",
      e.title,
      e.divisionId ? divisionName.get(e.divisionId) : "",
      e.location,
      e.fieldValues[0]?.value,
    ]);
    return { filename, csv: toCsv(HEADER, rows) };
  }

  const rows = SAMPLE.map(([day, start, end, title, team, venue, runBy]) => [
    format(addDays(tournament.startDate, day - 1), "yyyy-MM-dd"),
    start,
    end,
    title,
    team,
    venue,
    runBy,
  ]);
  return { filename, csv: toCsv(HEADER, rows) };
}

// ── The Academic Bowl ──────────────────────────────────────────────────

const BOWL_HEADER = ["division", "round", "date", "time", "team_a", "team_b", "room", "score_a", "score_b"];

// The finals, in bracket order: the Quarterfinal 1 and 2 winners meet in
// Semifinal 1, so the 1 and 2 seeds can only meet in the Final.
const FINALS: [string, string, string][] = [
  ["QF1", "seed 1", "seed 8"],
  ["QF2", "seed 4", "seed 5"],
  ["QF3", "seed 2", "seed 7"],
  ["QF4", "seed 3", "seed 6"],
  ["SF1", "winner QF1", "winner QF2"],
  ["SF2", "winner QF3", "winner QF4"],
  ["Consolation", "loser SF1", "loser SF2"],
  ["Final", "winner SF1", "winner SF2"],
];

// Round-robin pairings (the circle method), with the second half of the
// list playing the first; an odd count gets a bye each round.
function circleRounds<T>(items: T[]): [T, T][][] {
  const list: (T | null)[] = items.length % 2 === 0 ? [...items] : [...items, null];
  const rounds: [T, T][][] = [];
  for (let r = 0; r < list.length - 1; r++) {
    const round: [T, T][] = [];
    for (let i = 0; i < list.length / 2; i++) {
      const a = list[i];
      const b = list[list.length - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

const at = (day: Date, hours: number, minutes: number) => {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

// The bowl upload's example: the bowl as it stands once there are games,
// otherwise a full sample for both divisions - each league school's Red and
// Blue teams playing everyone but their own school's other team twice,
// timed to fit the schedule's "Academic Bowl Rounds 1-6" blocks (or a
// sensible default without them), then the seeded finals.
export async function buildBowlExample(tournamentId: string): Promise<{ filename: string; csv: string } | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: { orderBy: { date: "asc" } },
      bowlGames: { include: { teamA: { include: { school: true } }, teamB: { include: { school: true } } } },
    },
  });
  if (!tournament || !tournament.activity.usesAcademicFormat) return null;
  const filename = `${tournament.slug}-bowl.csv`;
  const divisions = sortDivisions(tournament.divisions);
  const stageOrder: BowlStage[] = ["ROUND_ROBIN", ...FINALS_STAGES.map((f) => f.stage)];

  if (tournament.bowlGames.length > 0) {
    const rank = new Map(divisions.map((d, i) => [d.id, i]));
    const nameOf = new Map(divisions.map((d) => [d.id, d.name]));
    const games = [...tournament.bowlGames].sort(
      (a, b) =>
        (rank.get(a.divisionId) ?? 0) - (rank.get(b.divisionId) ?? 0) ||
        stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) ||
        a.number - b.number ||
        a.startTime.getTime() - b.startTime.getTime() ||
        (a.room ?? "").localeCompare(b.room ?? "", undefined, { numeric: true })
    );
    const side = (team: (typeof games)[number]["teamA"], source: string | null) => (team ? teamLabel(team) : (source ?? ""));
    const rows = games.map((g) => [
      nameOf.get(g.divisionId),
      gameCode(g.stage, g.number),
      format(g.startTime, "yyyy-MM-dd"),
      format(g.startTime, "HH:mm"),
      side(g.teamA, g.sourceA),
      side(g.teamB, g.sourceB),
      g.room,
      g.scoreA,
      g.scoreB,
    ]);
    return { filename, csv: toCsv(BOWL_HEADER, rows) };
  }

  const schools = (await prisma.school.findMany({ where: { isLeagueMember: true }, orderBy: { name: "asc" } })).map((s) => s.code || s.name);
  const teams = schools.flatMap((school) => ["Red", "Blue"].map((colour) => ({ school, label: `${school} ${colour}` })));
  // Both legs, dropping a school's two teams playing each other.
  const legs = circleRounds(teams);
  const rounds = [...legs, ...legs.map((round) => round.map(([a, b]) => [b, a] as [typeof a, typeof a]))].map((round) =>
    round.filter(([a, b]) => a.school !== b.school)
  );
  const tracks = divisions.length > 0 ? divisions : [{ id: "", name: "Varsity" }, { id: "", name: "Junior Varsity" }];
  const day = (n: number) => addDays(tournament.startDate, n - 1);
  const lastDay = day(3);

  const rows: (string | number | null)[][] = [];
  tracks.forEach((track, t) => {
    const own = tournament.events.filter((e) => track.id && e.divisionId === track.id);
    // Each "Academic Bowl Rounds 1-6" block's rounds, spread evenly across it.
    const roundTimes = new Map<number, Date>();
    for (const e of own) {
      const range = e.title?.match(/rounds?\s+(\d+)\s*-\s*(\d+)/i);
      if (!range || !e.endDate) continue;
      const [from, to] = [Number(range[1]), Number(range[2])];
      const slot = (e.endDate.getTime() - e.date.getTime()) / (to - from + 1);
      for (let r = from; r <= to; r++) {
        const start = new Date(e.date.getTime() + (r - from) * slot);
        start.setMinutes(Math.round(start.getMinutes() / 5) * 5, 0, 0);
        roundTimes.set(r, start);
      }
    }
    // Otherwise six rounds a block, 25 minutes apart: two blocks a day, the
    // JV an hour ahead of Varsity.
    const roundTime = (r: number) => {
      if (roundTimes.has(r)) return roundTimes.get(r)!;
      const block = Math.floor((r - 1) / 6);
      const start = at(day(1 + Math.floor(block / 2)), block % 2 === 0 ? 10 - t : 14 - t, 0);
      return new Date(start.getTime() + ((r - 1) % 6) * 25 * 60_000);
    };
    rounds.forEach((games, r) => {
      const when = roundTime(r + 1);
      games.forEach(([a, b], g) => {
        rows.push([track.name, r + 1, format(when, "yyyy-MM-dd"), format(when, "HH:mm"), a.label, b.label, `Room ${g + 1}`, null, null]);
      });
    });

    const finalsItem = (pattern: RegExp) => own.find((e) => pattern.test(e.title ?? ""));
    const finalsTime: Record<string, { when: Date; room: string | null }> = {};
    const defaults: [string, RegExp, number, number][] = [
      ["QF", /quarter/i, 10, 30],
      ["SF", /semi/i, 11, 40],
      ["Consolation", /consolation/i, 14, 0],
      ["Final", /\bfinal\b/i, 15, 0],
    ];
    for (const [code, pattern, hours, minutes] of defaults) {
      const item = finalsItem(pattern);
      finalsTime[code] = { when: item?.date ?? at(lastDay, hours, minutes + t * 30), room: item?.location ?? null };
    }
    for (const [code, a, b] of FINALS) {
      const { when, room } = finalsTime[code.replace(/\d$/, "")];
      const n = Number(code.match(/\d$/)?.[0] ?? 1);
      const place = code.startsWith("QF") || code.startsWith("SF") ? `Room ${n}` : (room ?? "Theater");
      rows.push([track.name, code, format(when, "yyyy-MM-dd"), format(when, "HH:mm"), a, b, place, null, null]);
    }
  });
  return { filename, csv: toCsv(BOWL_HEADER, rows) };
}
