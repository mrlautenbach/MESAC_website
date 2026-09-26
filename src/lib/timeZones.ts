import { addMinutes, format } from "date-fns";
import { hasTime } from "@/lib/eventDisplay";

// The league's three time zones. None has daylight saving, so each is a
// fixed offset from UTC.
export type LeagueZone = "GULF" | "QATAR" | "INDIA";
// What a visitor has chosen to see times in: a zone, or each tournament's
// own local time.
export type TimeView = LeagueZone | "HOST";

export const LEAGUE_ZONES: Record<LeagueZone, { label: string; offsetMinutes: number }> = {
  GULF: { label: "UAE / Oman", offsetMinutes: 240 },
  QATAR: { label: "Qatar", offsetMinutes: 180 },
  INDIA: { label: "India", offsetMinutes: 330 },
};
export const ZONE_KEYS = Object.keys(LEAGUE_ZONES) as LeagueZone[];

export const TIME_VIEW_COOKIE = "mesac-time-zone";

export function isTimeView(value: string | undefined): value is TimeView {
  return value === "HOST" || (value !== undefined && value in LEAGUE_ZONES);
}

// A tournament's own time zone: its override, else its host school's, else
// the UAE's, where most of the league is.
export function tournamentZone(tournament: {
  timeZone?: LeagueZone | null;
  hostSchool?: { timeZone: LeagueZone } | null;
}): LeagueZone {
  return tournament.timeZone ?? tournament.hostSchool?.timeZone ?? "GULF";
}

// "Qatar time", "UAE / Oman time".
export const zoneName = (zone: LeagueZone) => `${LEAGUE_ZONES[zone].label} time`;

export type Clock = {
  // What the visitor chose, the zone times are shown in, and the
  // tournament's own.
  view: TimeView;
  zone: LeagueZone;
  hostZone: LeagueZone;
  // `date` with a date-fns pattern, moved into `zone`.
  format: (date: Date, pattern: string) => string;
  // Like formatWhen: the time when there is one, else the date alone.
  when: (date: Date, withTime: string, dateOnly?: string) => string;
};

// Times are stored as the tournament's local wall-clock time, so showing
// them in another zone moves each one by the difference between the two.
// A date with no time (midnight) is a whole day, and is never moved.
export function makeClock(hostZone: LeagueZone, view: TimeView): Clock {
  const zone = view === "HOST" ? hostZone : view;
  const shift = LEAGUE_ZONES[zone].offsetMinutes - LEAGUE_ZONES[hostZone].offsetMinutes;
  const move = (date: Date) => (hasTime(date) ? addMinutes(date, shift) : date);
  return {
    view,
    zone,
    hostZone,
    format: (date, pattern) => format(move(date), pattern),
    when: (date, withTime, dateOnly = "") =>
      hasTime(date) ? format(move(date), withTime) : dateOnly ? format(date, dateOnly) : "",
  };
}

