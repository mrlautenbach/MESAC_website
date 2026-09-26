import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { SportIcon } from "@/components/icons/SportIcon";
import { dayBounds, formatDateRange, leagueToday } from "@/lib/dates";

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
        include: {
          tournaments: { where: { archived: false }, orderBy: { startDate: "desc" }, take: 1, include: { hostSchool: true } },
        },
      },
    },
  });
}

export const metadata = { title: "Tournaments · MESAC" };

export default async function TournamentsIndexPage() {
  const seasons = await loadSeasons();
  const today = dayBounds(leagueToday()).gte;
  // Where a tournament is in its year: still to come, on now, or finished.
  const status = (t: { startDate: Date; endDate: Date }) =>
    t.startDate > today ? "Upcoming" : t.endDate >= today ? "On now" : "Finished";

  return (
    <div className="page-wrap py-8">
      <h6 className="text-primary-dark">Tournaments</h6>
      <h1 className="mt-2 mb-8 text-4xl sm:text-5xl">Every activity, every season.</h1>

      <div className="space-y-10">
        {seasons.map((season) => {
          const dateRange = SEASON_DATE_RANGES[season.order];
          return (
            <section key={season.id}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-xl text-primary-dark">{season.name}</h2>
                {dateRange && <span className="text-muted">{dateRange}</span>}
              </div>
              {season.activities.length === 0 ? (
                <p className="text-sm text-muted">No activities yet.</p>
              ) : (
                <ul className="divide-y divide-divider border-y border-divider">
                  {season.activities.map((a) => {
                    const current = a.tournaments[0];
                    const state = current ? status(current) : null;
                    return (
                      <li key={a.id}>
                        <Link
                          href={current ? `/seasons/${current.slug}` : `/tournaments/${a.slug}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 hover:bg-foreground/[.03] sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]"
                        >
                          <span className="flex min-w-0 items-center gap-2 font-bold">
                            <SportIcon sport={a.sport} size={20} />
                            <span className="truncate">{a.name}</span>
                          </span>
                          <span className="col-start-1 row-start-2 min-w-0 truncate pl-7 text-sm text-muted sm:col-start-2 sm:row-start-1 sm:pl-0">
                            {current ? (
                              <>
                                {formatDateRange(current.startDate, current.endDate)}
                                {current.hostSchool && ` · Hosted by ${current.hostSchool.name}`}
                              </>
                            ) : (
                              "No tournament yet"
                            )}
                          </span>
                          {state && (
                            <span
                              className={`row-span-2 tag sm:row-span-1 ${state === "On now" ? "tag-accent" : state === "Upcoming" ? "tag-outline" : "tag-neutral"}`}
                            >
                              {state}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {seasons.length === 0 && <p className="text-muted">No activities have been created yet.</p>}
    </div>
  );
}
