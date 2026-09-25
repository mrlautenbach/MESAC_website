import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { GOLF_FLIGHTS, GOLF_SEEDS_PER_SCHOOL, pairName, seedingIsFinal, teamSeeding } from "@/lib/golf";

// Downloadable example CSVs for each golf upload. Every one is a complete,
// valid file that uploads as-is: filled in from whatever the tournament
// already has (its roster, draw and results), and only falling back to
// clearly-labelled sample data where there's nothing yet. Extra columns
// such as `name` or `home_pair` are there for whoever edits the file - the
// importers ignore them.

export const GOLF_EXAMPLE_FILES = ["roster", "draw", "scores", "team-draw", "team-results"] as const;
export type GolfExampleFile = (typeof GOLF_EXAMPLE_FILES)[number];

type Player = { id: string; schoolId: string; seed: number; name: string; grade: number | null; gender: string | null; points: number | null };
type School = { id: string; label: string };

// Round-robin pairings (the circle method): every school plays every other
// once, one match each per round. An odd number of schools gets a bye each
// round.
function roundRobin<T>(items: T[]): [T, T][][] {
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

export async function buildGolfExample(tournamentId: string, file: GolfExampleFile): Promise<{ filename: string; csv: string } | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      golfPlayers: { include: { school: true } },
      golfGroups: { orderBy: { number: "asc" }, include: { players: { include: { school: true } } } },
      golfMatches: {
        orderBy: [{ round: "asc" }, { startTime: "asc" }],
        include: { homeSchool: true, awaySchool: true, pairs: { orderBy: { flight: "asc" } } },
      },
    },
  });
  if (!tournament || !tournament.activity.usesGolfFormat) return null;

  const label = (s: { code: string | null; name: string }) => s.code || s.name;
  const byName = (a: School, b: School) => a.label.localeCompare(b.label);

  // The schools and players the examples are built from: the real roster
  // once there is one, otherwise the league's member schools with sample
  // players ("ABA Player 1").
  let schools: School[];
  let players: Player[];
  if (tournament.golfPlayers.length > 0) {
    schools = [...new Map(tournament.golfPlayers.map((p) => [p.schoolId, { id: p.schoolId, label: label(p.school) }])).values()].sort(byName);
    players = tournament.golfPlayers;
  } else {
    const league = await prisma.school.findMany({ where: { isLeagueMember: true }, orderBy: { name: "asc" } });
    schools = league.map((s) => ({ id: s.id, label: label(s) })).sort(byName);
    players = schools.flatMap((school, i) =>
      Array.from({ length: GOLF_SEEDS_PER_SCHOOL }, (_, k) => ({
        id: `${school.id}:${k + 1}`,
        schoolId: school.id,
        seed: k + 1,
        name: `${school.label} Player ${k + 1}`,
        grade: 9 + ((i + k) % 4),
        gender: (i + k) % 3 === 0 ? "F" : "M",
        points: 40 - k * 5 - (i % 4),
      }))
    );
  }
  const schoolLabel = new Map(schools.map((s) => [s.id, s.label]));
  const bySchoolSeed = (a: Player, b: Player) =>
    (schoolLabel.get(a.schoolId) ?? "").localeCompare(schoolLabel.get(b.schoolId) ?? "") || a.seed - b.seed;
  const day1 = tournament.golfGroups[0]?.teeTime ?? tournament.startDate;
  const slug = `golf-${tournament.startDate.getFullYear()}`;

  if (file === "roster") {
    return {
      filename: `${slug}-roster.csv`,
      csv: toCsv(
        ["school", "seed", "name", "grade", "gender"],
        [...players].sort(bySchoolSeed).map((p) => [schoolLabel.get(p.schoolId), p.seed, p.name, p.grade, p.gender])
      ),
    };
  }

  if (file === "draw") {
    const header = ["date", "flight", "group", "tee_time", "school", "seed", "name", "marshal", "course"];
    if (tournament.golfGroups.length > 0) {
      const rows = tournament.golfGroups.flatMap((g) =>
        [...g.players].sort(bySchoolSeed).map((p, i) => [
          format(g.teeTime, "yyyy-MM-dd"),
          g.flight,
          g.number,
          format(g.teeTime, "HH:mm"),
          label(p.school),
          p.seed,
          p.name,
          i === 0 ? g.marshal : "",
          i === 0 ? g.course : "",
        ])
      );
      return { filename: `${slug}-day1-draw.csv`, csv: toCsv(header, rows) };
    }
    // Groups of four from four different schools: each flight's players
    // listed school by school (first pair member, then second) and cut into
    // fours, which never puts two players from one school together when
    // there are at least four schools. Tee times every 10 minutes from 8:30;
    // each group's marshal is a coach from a school not playing in it.
    const size = Math.min(4, schools.length);
    const rows: (string | number | null)[][] = [];
    let number = 0;
    for (const flight of GOLF_FLIGHTS) {
      const order = [2 * flight - 1, 2 * flight].flatMap((seed) =>
        schools.map((s) => players.find((p) => p.schoolId === s.id && p.seed === seed)).filter((p): p is Player => !!p)
      );
      for (let i = 0; i < order.length; i += size) {
        const group = order.slice(i, i + size);
        const time = new Date(day1);
        time.setHours(8, 30 + number * 10, 0, 0);
        number++;
        const marshalSchool = schools.find((s) => !group.some((p) => p.schoolId === s.id)) ?? schools[0];
        group.forEach((p, j) =>
          rows.push([
            format(day1, "yyyy-MM-dd"),
            flight,
            number,
            format(time, "HH:mm"),
            schoolLabel.get(p.schoolId) ?? "",
            p.seed,
            p.name,
            j === 0 ? `${marshalSchool.label} coach` : "",
            j === 0 && number === 1 ? "Championship Course" : "",
          ])
        );
      }
    }
    return { filename: `${slug}-day1-draw.csv`, csv: toCsv(header, rows) };
  }

  if (file === "scores") {
    // With a real roster this is a fill-in sheet: every player, with the
    // points already entered (or blank); the sample roster gets sample points.
    return {
      filename: `${slug}-day1-scores.csv`,
      csv: toCsv(
        ["school", "seed", "name", "points"],
        [...players].sort(bySchoolSeed).map((p) => [schoolLabel.get(p.schoolId), p.seed, p.name, p.points])
      ),
    };
  }

  // Team draw and results: the real draw once it exists, otherwise a full
  // round robin - seeds in order when Day 1 seeding is final - two rounds a
  // day from the day after Day 1, with the three pairs matches of a school
  // match starting on consecutive holes.
  type PlannedMatch = { round: number; startTime: Date; course: string | null; homeId: string; awayId: string; pairs: { flight: number; startHole: number | null; marshal: string | null; winner: string | null; margin: string | null }[] };
  let matches: PlannedMatch[];
  if (tournament.golfMatches.length > 0) {
    matches = tournament.golfMatches.map((m) => ({
      round: m.round,
      startTime: m.startTime,
      course: m.course,
      homeId: m.homeSchoolId,
      awayId: m.awaySchoolId,
      pairs: m.pairs.map((p) => ({
        flight: p.flight,
        startHole: p.startHole,
        marshal: p.marshal,
        winner: p.winner === "HALVED" ? "halved" : p.winner === "HOME" ? label(m.homeSchool) : p.winner === "AWAY" ? label(m.awaySchool) : null,
        margin: p.winner === "HALVED" ? null : p.margin,
      })),
    }));
  } else {
    const seeding = teamSeeding(schools, players);
    const ordered = seedingIsFinal(seeding) ? seeding.map((r) => r.school) : schools;
    const sampleResults: [string | null, string | null][] = [
      ["away", "3 up"],
      ["home", "2&1"],
      ["halved", null],
    ];
    matches = roundRobin(ordered).flatMap((round, r) => {
      const startTime = addDays(new Date(day1), 1 + Math.floor(r / 2));
      startTime.setHours(r % 2 === 0 ? 7 : 12, 30, 0, 0);
      return round.map(([home, away], m) => ({
        round: r + 1,
        startTime,
        course: "Academy Course",
        homeId: home.id,
        awayId: away.id,
        pairs: GOLF_FLIGHTS.map((flight) => {
          const [side, margin] = sampleResults[(r + m + flight) % sampleResults.length];
          return {
            flight,
            startHole: 3 * m + flight,
            marshal: null,
            winner: side === "halved" ? "halved" : side === "home" ? home.label : away.label,
            margin,
          };
        }),
      }));
    });
  }

  if (file === "team-draw") {
    const rows = matches.flatMap((m) =>
      m.pairs.map((p) => [
        m.round,
        format(m.startTime, "yyyy-MM-dd"),
        format(m.startTime, "HH:mm"),
        schoolLabel.get(m.homeId) ?? m.homeId,
        schoolLabel.get(m.awayId) ?? m.awayId,
        p.flight,
        p.startHole,
        p.marshal,
        m.course,
        pairName(players, m.homeId, p.flight),
        pairName(players, m.awayId, p.flight),
      ])
    );
    return {
      filename: `${slug}-team-draw.csv`,
      csv: toCsv(["round", "date", "time", "home", "away", "flight", "start_hole", "marshal", "course", "home_pair", "away_pair"], rows),
    };
  }

  // Team results: with a real draw, every pairs match with whatever result
  // it has (blank = not played yet) - a fill-in sheet for the whole event.
  const rows = matches.flatMap((m) =>
    m.pairs.map((p) => [
      m.round,
      schoolLabel.get(m.homeId) ?? m.homeId,
      schoolLabel.get(m.awayId) ?? m.awayId,
      p.flight,
      pairName(players, m.homeId, p.flight),
      pairName(players, m.awayId, p.flight),
      p.winner,
      p.margin,
    ])
  );
  return {
    filename: `${slug}-team-results.csv`,
    csv: toCsv(["round", "home", "away", "flight", "home_pair", "away_pair", "winner", "margin"], rows),
  };
}
