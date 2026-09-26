import { format } from "date-fns";
import { findDivision, normalizeDivisionName } from "@/lib/divisionAlias";

// Academic Games' schedule is a day-by-day timeline of competitions. Some
// are for every team (the Current Events Olympiad, the finals in the
// Theater); the rest run as two parallel tracks, Varsity and Junior Varsity,
// with their own times and venues. Each item is an Event with a start, an
// end, a venue and a division - no division means every team.

// The activity field that holds who runs a competition ("Math Challenge -
// run by AS Dubai"), created by the schedule upload the first time it's used.
export const RUN_BY_FIELD = { key: "run_by", label: "Run by" } as const;

// The two tracks an upload can add on its own if the tournament doesn't
// have them yet - anything else has to be set up as a division first.
const TRACK_NAMES: Record<string, string> = { varsity: "Varsity", "junior varsity": "Junior Varsity" };

// Which track a CSV's team/division cell means: one of the tournament's
// divisions ("JV" matches "Junior Varsity"), or Varsity / Junior Varsity
// still to be added. `undefined` when it's neither.
export function matchTrack(divisions: { id: string; name: string }[], raw: string): { id: string } | { newName: string } | undefined {
  const existing = findDivision(divisions, raw);
  if (existing) return { id: existing.id };
  const newName = TRACK_NAMES[normalizeDivisionName(raw)];
  return newName ? { newName } : undefined;
}

// "Varsity, Junior Varsity" - for an error message listing what's allowed.
export function trackNames(divisions: { name: string }[]): string {
  return [...new Set([...divisions.map((d) => d.name), ...Object.values(TRACK_NAMES)])].join(", ");
}

// Varsity first, then Junior Varsity, then anything else by name - the
// order the two tracks sit side by side.
export function divisionRank(name: string): number {
  const key = normalizeDivisionName(name);
  return key === "varsity" ? 0 : key === "junior varsity" ? 1 : 2;
}

export function sortDivisions<D extends { name: string }>(divisions: D[]): D[] {
  return [...divisions].sort((a, b) => divisionRank(a.name) - divisionRank(b.name) || a.name.localeCompare(b.name));
}

// "9:25", "09:25", "13:45", "9:25am", "12:50 pm", "1pm" -> hours and minutes
// on a 24-hour clock, or null if it isn't a time.
export function parseClock(raw: string): { hours: number; minutes: number } | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  const meridiem = m[3]?.[0];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  } else if (hours > 23 || m[2] === undefined) {
    // A bare "9" is too ambiguous to guess at - it needs minutes or am/pm.
    return null;
  }
  return { hours, minutes };
}

// "9:25-10:15am", "11:40am-12:00pm", or just "8:45am" with no end - in
// another time zone when given that zone's formatter (a Clock's format).
export function formatTimeRange(
  start: Date,
  end: Date | null,
  formatIn: (date: Date, pattern: string) => string = format
): string {
  const time = (date: Date) => formatIn(date, "h:mm");
  const startMeridiem = formatIn(start, "aaa");
  if (!end) return `${time(start)}${startMeridiem}`;
  const endMeridiem = formatIn(end, "aaa");
  const from = startMeridiem === endMeridiem ? time(start) : `${time(start)}${startMeridiem}`;
  return `${from}–${time(end)}${endMeridiem}`;
}

export type TimelineItem = {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  venue: string | null;
  runBy: string | null;
  divisionId: string | null;
};

export type TimelineBlock<I extends TimelineItem> =
  | { kind: "shared"; item: I }
  // A run of track-specific items between two shared ones, one list per
  // division in side-by-side order.
  | { kind: "split"; columns: { divisionId: string; items: I[] }[] };

export type TimelineDay<I extends TimelineItem> = { key: string; date: Date; blocks: TimelineBlock<I>[] };

// Each day's items as the timeline reads them: shared items as their own
// full-width rows, and everything between two of them grouped into one
// side-by-side block. A track with nothing in a block still gets its
// (empty) column, so Varsity is always on the same side.
export function timelineDays<I extends TimelineItem>(items: I[], divisions: { id: string; name: string }[]): TimelineDay<I>[] {
  const columnOrder = sortDivisions(divisions).map((d) => d.id);
  const sorted = [...items].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      columnOrder.indexOf(a.divisionId ?? "") - columnOrder.indexOf(b.divisionId ?? "") ||
      a.title.localeCompare(b.title)
  );

  const days = new Map<string, TimelineDay<I>>();
  for (const item of sorted) {
    const key = format(item.start, "yyyy-MM-dd");
    let day = days.get(key);
    if (!day) {
      day = { key, date: item.start, blocks: [] };
      days.set(key, day);
    }
    if (!item.divisionId) {
      day.blocks.push({ kind: "shared", item });
      continue;
    }
    let block = day.blocks.at(-1);
    if (!block || block.kind !== "split") {
      block = { kind: "split", columns: columnOrder.map((divisionId) => ({ divisionId, items: [] })) };
      day.blocks.push(block);
    }
    block.columns.find((c) => c.divisionId === item.divisionId)?.items.push(item);
  }
  return [...days.values()];
}

// ── The challenges ─────────────────────────────────────────────────────
// Every timeline item except the Academic Bowl's blocks is a challenge with
// its own results: each school's place and score, per division. Six of them
// form two groups of three, and each group ranks schools by their total
// score across its three.

export const CHALLENGE_GROUPS = [
  { name: "STEM", pattern: /\b(math|engineering|science)/i },
  { name: "Humanities", pattern: /\b(humanities|current events|arts?)\b/i },
] as const;

export const isBowlItem = (title: string) => /\bbowl\b/i.test(title);

export function challengeGroup(title: string): string | null {
  return CHALLENGE_GROUPS.find((g) => g.pattern.test(title))?.name ?? null;
}

// "Math Challenge" -> "Math", "Art and Music Olympiad" -> "Art and Music" -
// for a group table's column headings.
export function shortChallengeName(title: string): string {
  return title.replace(/\s*\(.*?\)\s*/g, " ").replace(/\b(challenge|olympiad)\b/gi, "").replace(/\s+/g, " ").trim() || title;
}

type ChallengeRow = { schoolId: string; place: number | null; score: number | null };

// A challenge's results in finishing order, each with its place: the place
// given, or - where a file only gave scores - worked out from them, highest
// first, level scores sharing a place.
export function rankChallenge<R extends ChallengeRow>(rows: R[]): (R & { rank: number | null })[] {
  if (rows.some((r) => r.place !== null)) {
    return [...rows]
      .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || (b.score ?? 0) - (a.score ?? 0))
      .map((r) => ({ ...r, rank: r.place }));
  }
  const sorted = [...rows].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  return sorted.map((r) => ({ ...r, rank: r.score === null ? null : sorted.findIndex((s) => s.score === r.score) + 1 }));
}

export type GroupRow<S> = { school: S; scores: Map<string, number | null>; total: number; place: number };

// One group's table for one division: each school's score in each of the
// group's challenges and their total, highest total first. Complete once
// every challenge in the group has results.
export function groupStandings<S extends { id: string; name: string }>(
  schools: S[],
  challenges: { id: string }[],
  results: (ChallengeRow & { eventId: string })[]
): { rows: GroupRow<S>[]; complete: boolean; challengesIn: number } {
  const own = results.filter((r) => challenges.some((c) => c.id === r.eventId));
  const entered = schools.filter((s) => own.some((r) => r.schoolId === s.id));
  const rows = entered.map((school) => {
    const scores = new Map(
      challenges.map((c) => [c.id, own.find((r) => r.eventId === c.id && r.schoolId === school.id)?.score ?? null])
    );
    return { school, scores, total: [...scores.values()].reduce<number>((sum, v) => sum + (v ?? 0), 0), place: 0 };
  });
  rows.sort((a, b) => b.total - a.total || a.school.name.localeCompare(b.school.name));
  for (const row of rows) row.place = rows.findIndex((r) => r.total === row.total) + 1;
  const challengesIn = challenges.filter((c) => own.some((r) => r.eventId === c.id)).length;
  return { rows, complete: challenges.length > 0 && challengesIn === challenges.length, challengesIn };
}
