// The three Seasons run on a fixed academic-year calendar, not a per-year
// configurable one - hardcoded here rather than stored per Season row.
export const SEASON_DATE_RANGES: Record<number, string> = {
  1: "August – November 10",
  2: "November 11 – February 15",
  3: "February 16 – May 30",
};

export const OFF_SEASON_LABEL = "Coming Soon";
export const OFF_SEASON_RANGE = "June – July";
