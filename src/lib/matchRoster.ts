import { EXPECTED_ROSTER } from "@/lib/expectedRoster";

type ActivityLike = { id: string; name: string; sport: string; tournaments: unknown[] };

export type RosterRow<A> = { key: string; sport: string; name: string; activity?: A };

// Merges the year's planned roster with whatever's actually been set up for
// a season, so a sport with no Activity row yet still shows as a "coming
// soon" placeholder instead of the season looking sparse.
export function matchRosterForSeason<A extends ActivityLike>(seasonOrder: number, activities: A[]): RosterRow<A>[] {
  const byName = new Map(activities.map((a) => [a.name.trim().toLowerCase(), a]));
  const matchedIds = new Set<string>();
  const rows: RosterRow<A>[] = [];

  for (const expected of EXPECTED_ROSTER.filter((e) => e.seasonOrder === seasonOrder)) {
    let match = byName.get(expected.name.trim().toLowerCase());
    if (match) {
      matchedIds.add(match.id);
    } else {
      // No exact name match, but don't show "coming soon" right next to an
      // activity that's clearly the same thing under a different name (e.g.
      // a data-entry mismatch) and already has a live tournament - fall back
      // to matching by sport in that case instead of showing a duplicate
      // placeholder. Exclude activities already claimed by an earlier
      // roster row so a sibling row of the same sport can't steal it too.
      match = activities.find(
        (a) => !matchedIds.has(a.id) && a.sport.trim().toLowerCase() === expected.sport.trim().toLowerCase() && a.tournaments[0]
      );
      if (match) matchedIds.add(match.id);
    }
    rows.push({ key: expected.name, sport: expected.sport, name: expected.name, activity: match });
  }
  for (const a of activities) {
    if (!matchedIds.has(a.id)) rows.push({ key: a.id, sport: a.sport, name: a.name, activity: a });
  }
  return rows;
}
