import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { SportIcon } from "@/components/icons/SportIcon";

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
          // Just the activities that actually exist - no "coming soon"
          // placeholders for a planned-but-not-yet-created sport, since the
          // matching logic that produced those was a repeated source of bugs
          // (duplicate/mismatched entries).
          const groups = new Map<string, typeof season.activities>();
          for (const a of season.activities) {
            const group = groups.get(a.sport) ?? [];
            group.push(a);
            groups.set(a.sport, group);
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
                  <div key={sport} className="border-b border-divider py-2">
                    <div className="grid grid-cols-1 items-center gap-x-6 gap-y-2 sm:grid-cols-[250px_1fr]">
                      <h6 className="flex items-center gap-1.5 text-muted" style={{ fontSize: 18, lineHeight: "20px" }}>
                        <SportIcon sport={sport} size={20} />
                        {sport}
                      </h6>
                      <ul className="flex flex-wrap gap-2">
                        {group.map((a) => {
                          const current = a.tournaments[0];
                          return (
                            <li key={a.id}>
                              <Link href={current ? `/seasons/${current.slug}` : `/tournaments/${a.slug}`} className="btn btn-secondary">
                                {current ? current.name : a.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ))}
                {season.activities.length === 0 && <p className="text-sm text-muted">No activities yet.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {seasons.length === 0 && <p className="text-muted">No activities have been created yet.</p>}
    </div>
  );
}
