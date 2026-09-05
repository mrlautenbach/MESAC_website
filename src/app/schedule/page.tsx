import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { format, startOfDay } from "date-fns";
import { sideLabel } from "@/lib/eventDisplay";
import { SchoolColorDot } from "@/components/SchoolColorDot";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { matchRosterForSeason } from "@/lib/matchRoster";
import { LiveIcon } from "@/components/icons/LiveIcon";

export const dynamic = "force-dynamic";

const PREVIEW_COUNT = 3;

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
          tournaments: { where: { archived: false }, orderBy: { startDate: "desc" }, take: 1 },
          divisions: true,
        },
      },
    },
  });
}

export default async function SchedulePage() {
  const today = startOfDay(new Date());
  const seasons = await loadSeasons();

  const currentTournamentIds = seasons.flatMap((s) => s.activities.flatMap((a) => a.tournaments.map((t) => t.id)));

  const upcoming = await prisma.event.findMany({
    where: { tournamentId: { in: currentTournamentIds }, date: { gte: today }, status: { not: "CANCELLED" } },
    orderBy: { date: "asc" },
    include: {
      participants: { include: { school: true } },
      division: true,
      homeSourceEvent: { select: { externalId: true } },
      awaySourceEvent: { select: { externalId: true } },
    },
  });

  const eventsByTournamentId = new Map<string, typeof upcoming>();
  for (const event of upcoming) {
    const list = eventsByTournamentId.get(event.tournamentId) ?? [];
    list.push(event);
    eventsByTournamentId.set(event.tournamentId, list);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h6 className="text-primary-dark">Live &amp; upcoming</h6>
      <h1 className="mt-2 mb-8 text-4xl sm:text-5xl">Every activity, its own schedule.</h1>

      <div className="space-y-10">
        {seasons.map((season) => {
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
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[160px_1fr]">
                      <h6 className="pt-1 text-muted">{sport}</h6>
                      <div className="space-y-4">
                        {group.map((row) => {
                          if (!row.activity) {
                            return (
                              <p key={row.key} className="text-sm text-muted">
                                {row.name} (not set up yet)
                              </p>
                            );
                          }
                          const a = row.activity;
                          const current = a.tournaments[0];
                          const events = current ? (eventsByTournamentId.get(current.id) ?? []) : [];

                          return (
                            <div key={row.key}>
                              <div className="mb-1.5 flex items-baseline gap-2">
                                <Link
                                  href={current ? `/seasons/${current.slug}` : `/tournaments/${a.slug}`}
                                  className="font-bold hover:text-primary"
                                >
                                  {a.name}
                                </Link>
                                {current && events.length > 0 && (
                                  <Link
                                    href={a.divisions.length === 0 ? `/seasons/${current.slug}/schedule` : `/seasons/${current.slug}`}
                                    className="text-xs text-primary-dark hover:underline"
                                  >
                                    Full schedule &rarr;
                                  </Link>
                                )}
                              </div>

                              {!current ? (
                                <p className="text-xs text-muted">No tournament scheduled yet.</p>
                              ) : events.length === 0 ? (
                                <p className="text-xs text-muted">No upcoming games.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {events.slice(0, PREVIEW_COUNT).map((event) => {
                                    const home = event.participants.find((p) => p.isHome) ?? null;
                                    const away = event.participants.find((p) => !p.isHome) ?? null;
                                    const isDual = event.participants.length <= 2;
                                    const href = event.division
                                      ? `/seasons/${current.slug}/${event.division.slug}/schedule`
                                      : `/seasons/${current.slug}/schedule`;
                                    return (
                                      <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-sm">
                                        <Link href={href} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 hover:text-primary">
                                          <span className="tabular-nums text-muted">{format(event.date, "MMM d, h:mm a")}</span>
                                          {event.division && (
                                            <span
                                              className={`tag ${event.division.name.toLowerCase() === "girls" ? "tag-girls" : event.division.name.toLowerCase() === "boys" ? "tag-boys" : "tag-neutral"}`}
                                            >
                                              {event.division.name}
                                            </span>
                                          )}
                                          {isDual ? (
                                            <span className="inline-flex items-center gap-3">
                                              <span className="inline-flex items-center gap-1">
                                                <SchoolColorDot color={home?.school.themeColor} secondaryColor={home?.school.themeColorSecondary} />
                                                {sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)}
                                              </span>
                                              <span className="text-muted">v</span>
                                              <span className="inline-flex items-center gap-1">
                                                <SchoolColorDot color={away?.school.themeColor} secondaryColor={away?.school.themeColorSecondary} />
                                                {sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId)}
                                              </span>
                                            </span>
                                          ) : (
                                            <span>{event.participants.map((p) => p.school.name).join(" vs ")}</span>
                                          )}
                                        </Link>
                                        {event.streamUrl && event.status === "SCHEDULED" && (
                                          <a
                                            href={event.streamUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="tag tag-accent shrink-0 gap-1"
                                          >
                                            <LiveIcon />
                                            Watch live
                                          </a>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
