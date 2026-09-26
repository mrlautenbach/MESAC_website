import { addDays, format } from "date-fns";

// The league's dates, one way everywhere: day before month ("Thursday 29
// October", "Thu 29 Oct", "29 Oct – 1 Nov 2026"), times as "9:30 AM".

// Games are entered as the league's local wall-clock time and stored
// as-is, so "today" is the league's own calendar day - worked out in Gulf
// time, where most schools are, rather than wherever the server runs.
export const LEAGUE_TIME_ZONE = "Asia/Dubai";

// Today's date in the league, as yyyy-MM-dd.
export function leagueToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LEAGUE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// The stored times that fall on one day (yyyy-MM-dd): [gte, lt).
export function dayBounds(day: string): { gte: Date; lt: Date } {
  const start = new Date(`${day}T00:00:00`);
  return { gte: start, lt: addDays(start, 1) };
}

export const isDayKey = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const formatDay = (date: Date) => format(date, "EEEE d MMMM");
export const formatDayWithYear = (date: Date) => format(date, "EEEE d MMMM yyyy");
export const formatShortDay = (date: Date) => format(date, "EEE d MMM");

// "29 Oct – 1 Nov 2026", or "29 Oct 2026" for a single day.
export function formatDateRange(start: Date, end: Date): string {
  if (format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) return format(start, "d MMM yyyy");
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}
