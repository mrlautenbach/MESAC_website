// A division can go by more than one common spelling - "JV" and "Junior
// Varsity" mean the same thing, whichever one an admin actually named the
// Division. Normalizing both a Division's stored name and a CSV's division
// column through this before comparing lets either spelling match it.
const DIVISION_ALIASES: Record<string, string> = {
  jv: "junior varsity",
};

export function normalizeDivisionName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return DIVISION_ALIASES[lower] ?? lower;
}
