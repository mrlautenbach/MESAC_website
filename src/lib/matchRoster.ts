import { EXPECTED_ROSTER } from "@/lib/expectedRoster";

type ActivityLike = { id: string; name: string; sport: string; tournaments: unknown[] };

export type RosterRow<A> = { key: string; sport: string; name: string; activity?: A };

// Merges the year's planned roster with whatever's actually been set up for
// a season, so a sport with no Activity row yet still shows as a "coming
// soon" placeholder instead of the season looking sparse.
export function matchRosterForSeason<A extends ActivityLike>(seasonOrder: number, activities: A[]): RosterRow<A>[] {
  const expected = EXPECTED_ROSTER.filter((e) => e.seasonOrder === seasonOrder);
  const byName = new Map(activities.map((a) => [a.name.trim().toLowerCase(), a]));
  const matchedIds = new Set<string>();

  // Reserve every exact name match first, across all roster rows, before any
  // sport-based fallback runs - otherwise an earlier row's fallback (e.g. "JV
  // Soccer" when only a "Varsity Soccer" activity exists so far) could grab
  // an activity that a later row is entitled to by exact name, leaving both
  // rows pointing at the same activity and the true "coming soon" row hidden.
  const exactMatches = new Map<string, A>();
  for (const e of expected) {
    const match = byName.get(e.name.trim().toLowerCase());
    if (match) {
      exactMatches.set(e.name, match);
      matchedIds.add(match.id);
    }
  }

  const rows: RosterRow<A>[] = [];
  for (const e of expected) {
    let match = exactMatches.get(e.name);
    if (!match) {
      // No exact name match, but don't show "coming soon" right next to an
      // activity that's clearly the same thing under a different name (e.g.
      // a data-entry mismatch) and already has a live tournament - fall back
      // to matching by sport in that case instead of showing a duplicate
      // placeholder. Only consider activities no roster row has claimed yet.
      match = activities.find(
        (a) => !matchedIds.has(a.id) && a.sport.trim().toLowerCase() === e.sport.trim().toLowerCase() && a.tournaments[0]
      );
      if (match) matchedIds.add(match.id);
    }
    rows.push({ key: e.name, sport: e.sport, name: e.name, activity: match });
  }
  for (const a of activities) {
    if (!matchedIds.has(a.id)) rows.push({ key: a.id, sport: a.sport, name: a.name, activity: a });
  }
  return rows;
}
