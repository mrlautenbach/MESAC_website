import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";

export const dynamic = "force-dynamic";

export default async function TournamentsIndexPage() {
  const seasons = await prisma.season.findMany({
    orderBy: [{ order: "asc" }],
    include: {
      activities: {
        orderBy: [{ name: "asc" }],
        include: { tournaments: { where: { isCurrent: true }, take: 1 } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h6 className="text-primary-dark">Tournament results</h6>
      <h1 className="mt-2 mb-8 text-4xl sm:text-5xl">Every activity, one table each.</h1>

      <div className="space-y-10">
        {seasons.map((season) => {
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
                  <div key={sport} className="border-b border-divider py-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[160px_1fr]">
                      <h6 className="pt-1 text-muted">{sport}</h6>
                      <ul className="flex flex-wrap gap-2">
                        {group.map((a) => {
                          const current = a.tournaments[0];
                          return (
                            <li key={a.id}>
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
