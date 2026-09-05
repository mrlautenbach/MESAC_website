import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { matchRosterForSeason } from "@/lib/matchRoster";

export const dynamic = "force-dynamic";

function loadSeasons() {
  return prisma.season.findMany({
    orderBy: [{ order: "asc" }],
    include: {
      activities: {
        orderBy: [{ name: "asc" }],
        // The most recent non-archived tournament, not "isCurrent: true" -
        // that flag is hand-set per activity and can be wrong or unset,
        // which would otherwise make a genuinely live tournament vanish
        // from its own activity and show up as an unmatched duplicate.
        include: { tournaments: { where: { archived: false }, orderBy: { startDate: "desc" }, take: 1 } },
      },
    },
  });
}

export default async function TournamentsIndexPage() {
  const seasons = await loadSeasons();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h6 className="text-primary-dark">Tournament results</h6>
      <h1 className="mt-2 mb-8 text-4xl sm:text-5xl">Every activity, one table each.</h1>

      <div className="space-y-10">
        {seasons.map((season) => {
          // Merge the year's planned roster with whatever's actually been
          // set up - a sport with no Activity row yet still shows, just as
          // an unclickable placeholder, so the season doesn't look sparse
          // while data entry is still in progress.
          const rows = matchRosterForSeason(season.order, season.activities);

          const groups = new Map<string, typeof rows>();
          for (const row of rows) {
            const group = groups.get(row.sport) ?? [];
            group.push(row);
            groups.set(row.sport, group);
          }
          const dateRange = SEASON_DATE_RANGES[season.order];

          return (
            <section key={season.id}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-xl font-bold">{season.name}</h2>
                {dateRange && <span className="text-sm text-muted">{dateRange}</span>}
              </div>

              <div className="space-y-3">
                {Array.from(groups.entries()).map(([sport, group]) => (
                  <div key={sport} className="border-b border-divider py-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[160px_1fr]">
                      <h6 className="pt-1 text-muted">{sport}</h6>
                      <ul className="flex flex-wrap gap-2">
                        {group.map((row) => {
                          if (!row.activity) {
                            return (
                              <li key={row.key}>
                                <span
                                  className="btn cursor-default border border-dashed border-divider text-muted"
                                  title="Not set up yet"
                                >
                                  {row.name} (coming soon)
                                </span>
                              </li>
                            );
                          }
                          const a = row.activity;
                          const current = a.tournaments[0];
                          return (
                            <li key={row.key}>
                              <Link href={current ? `/seasons/${current.slug}` : `/tournaments/${a.slug}`} className="btn btn-secondary">
                                {a.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ))}
                {rows.length === 0 && <p className="text-sm text-muted">No activities yet.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {seasons.length === 0 && <p className="text-muted">No activities have been created yet.</p>}
    </div>
  );
}
