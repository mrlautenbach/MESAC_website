import { format } from "date-fns";
import { normalizeDivisionName } from "@/lib/divisionAlias";

// Academic Games' schedule is a day-by-day timeline of competitions. Some
// are for every team (the Current Events Olympiad, the finals in the
// Theater); the rest run as two parallel tracks, Varsity and Junior Varsity,
// with their own times and venues. Each item is an Event with a start, an
// end, a venue and a division - no division means every team.

// The activity field that holds who runs a competition ("Math Challenge -
// run by AS Dubai"), created by the schedule upload the first time it's used.
export const RUN_BY_FIELD = { key: "run_by", label: "Run by" } as const;

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

function clock(date: Date): string {
  return format(date, "h:mm");
}

// "9:25-10:15am", "11:40am-12:00pm", or just "8:45am" with no end.
export function formatTimeRange(start: Date, end: Date | null): string {
  const startMeridiem = format(start, "aaa");
  if (!end) return `${clock(start)}${startMeridiem}`;
  const endMeridiem = format(end, "aaa");
  const from = startMeridiem === endMeridiem ? clock(start) : `${clock(start)}${startMeridiem}`;
  return `${from}–${clock(end)}${endMeridiem}`;
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
