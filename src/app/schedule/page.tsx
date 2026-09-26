import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_ORDER } from "@/lib/eventOrder";
import { startOfDay } from "date-fns";
import { formatWhen, sideLabel } from "@/lib/eventDisplay";
import { SchoolColorDot } from "@/components/SchoolColorDot";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { matchRosterForSeason } from "@/lib/matchRoster";
import { LiveIcon } from "@/components/icons/LiveIcon";
import { SportIcon } from "@/components/icons/SportIcon";
import { divisionTagClass } from "@/lib/divisionTagClass";

export const metadata = { title: "Schedule" };

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
          tournaments: {
            where: { archived: false },
            orderBy: { startDate: "desc" },
            take: 1,
            include: { divisions: true },
          },
        },
      },
    },
  });
}

export default async function SchedulePage() {
  const today = startOfDay(new Date());
  const seasons = await loadSeasons();

  const currentTournamentIds = seasons.flatMap((s) => s.activities.flatMap((a) => a.tournaments.map((t) => t.id)));

  // One bounded query per tournament rather than one unbounded query over all
  // of them: this page only ever shows PREVIEW_COUNT rows per activity, and a
  // single global `take` would let one busy tournament's events crowd every
  // other tournament out of the result set entirely.
  const previews = await Promise.all(
    currentTournamentIds.map((tournamentId) =>
      prisma.event.findMany({
        where: { tournamentId, date: { gte: today }, status: { not: "CANCELLED" } },
        orderBy: SCHEDULE_ORDER,
        take: PREVIEW_COUNT,
        include: {
          participants: { include: { school: true } },
          division: true,
          homeSourceEvent: { select: { externalId: true } },
          awaySourceEvent: { select: { externalId: true } },
        },
      })
    )
  );

  const eventsByTournamentId = new Map<string, (typeof previews)[number]>();
  for (const events of previews) {
    if (events.length > 0) eventsByTournamentId.set(events[0].tournamentId, events);
  }

  return (
    <div className="page-wrap py-8">
      <p className="eyebrow text-primary-dark">Live &amp; upcoming</p>
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
          const eventsFor = (row: (typeof rows)[number]) => {
            const current = row.activity?.tournaments[0];
            return current ? (eventsByTournamentId.get(current.id) ?? []) : [];
          };
          // Sports with nothing coming up collapse into one line at the end,
          // so a quiet season doesn't read as a long list of empty rows.
          const allGroups = Array.from(groups.entries());
          const busyGroups = allGroups.filter(([, group]) => group.some((row) => eventsFor(row).length > 0));
          const quietRows = allGroups
            .filter(([, group]) => !group.some((row) => eventsFor(row).length > 0))
            .flatMap(([, group]) => group);

          return (
            <section key={season.id}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-xl">{season.name}</h2>
                {dateRange && <span className="text-sm text-muted">{dateRange}</span>}
              </div>

              <div className="space-y-3">
                {busyGroups.map(([sport, group]) => (
                  <div key={sport} className="border-b border-divider py-3">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[160px_1fr]">
                      <h6 className="flex items-center gap-1.5 pt-1 text-muted">
                        <SportIcon sport={sport} size={16} />
                        {sport}
                      </h6>
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
                                    href={current.divisions.length === 0 ? `/seasons/${current.slug}/schedule` : `/seasons/${current.slug}`}
                                    className="text-xs text-primary-dark hover:underline"
                                  >
                                    Full schedule &rarr;
                                  </Link>
                                )}
                              </div>

                              {!current ? (
                                <p className="text-xs text-muted">No tournament scheduled yet.</p>
                              ) : events.length === 0 ? (
                                <p className="text-xs text-muted">
                                  {a.scoringType === "NONE" ? "No upcoming events." : "No upcoming games."}
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {events.slice(0, PREVIEW_COUNT).map((event) => {
                                    const home = event.participants.find((p) => p.isHome) ?? null;
                                    const away = event.participants.find((p) => !p.isHome) ?? null;
                                    // A meet session never sets any of these source fields; a
                                    // team game does, even before either side has a concrete
                                    // school (e.g. both sides still pending).
                                    const hasMatchup =
                                      event.participants.length > 0 ||
                                      Boolean(
                                        event.homeSourceOutcome ||
                                          event.awaySourceOutcome ||
                                          event.homeSourceStanding ||
                                          event.awaySourceStanding ||
                                          event.homeSourceLabel ||
                                          event.awaySourceLabel
                                      );
                                    const isDual = event.participants.length <= 2;
                                    const href = `/seasons/${current.slug}/events/${event.slug}`;
                                    // Codes on a phone, where two full school names wrap
                                    // into four lines around the "v".
                                    const name = (side: typeof home, label: string) =>
                                      side?.school.code ? (
                                        <>
                                          <span className="sm:hidden">{side.school.code}</span>
                                          <span className="hidden sm:inline">{label}</span>
                                        </>
                                      ) : (
                                        label
                                      );
                                    return (
                                      <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-sm">
                                        <Link href={href} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 hover:text-primary">
                                          <span className="tabular-nums text-muted">{formatWhen(event.date, "EEE d MMM, h:mm a", "EEE d MMM")}</span>
                                          {event.division && (
                                            <span className={`tag ${divisionTagClass(event.division.name)}`}>{event.division.name}</span>
                                          )}
                                          {!hasMatchup ? (
                                            <span>{event.title ?? "Untitled session"}</span>
                                          ) : isDual ? (
                                            <span className="inline-flex items-center gap-3">
                                              <span className="inline-flex items-center gap-1">
                                                <SchoolColorDot color={home?.school.themeColor} secondaryColor={home?.school.themeColorSecondary} />
                                                {name(
                                                  home,
                                                  sideLabel(
                                                    home,
                                                    event.homeSourceOutcome,
                                                    event.homeSourceEvent?.externalId,
                                                    event.homeSourceStanding,
                                                    event.homeSourceLabel
                                                  )
                                                )}
                                              </span>
                                              <span className="text-muted">v</span>
                                              <span className="inline-flex items-center gap-1">
                                                <SchoolColorDot color={away?.school.themeColor} secondaryColor={away?.school.themeColorSecondary} />
                                                {name(
                                                  away,
                                                  sideLabel(
                                                    away,
                                                    event.awaySourceOutcome,
                                                    event.awaySourceEvent?.externalId,
                                                    event.awaySourceStanding,
                                                    event.awaySourceLabel
                                                  )
                                                )}
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
                {quietRows.length > 0 && (
                  <p className="border-b border-divider py-3 text-sm text-muted">
                    <span className="font-semibold">Nothing scheduled yet:</span>{" "}
                    {quietRows.map((row, i) => (
                      <span key={row.key}>
                        {i > 0 && ", "}
                        {row.activity ? (
                          <Link
                            href={
                              row.activity.tournaments[0]
                                ? `/seasons/${row.activity.tournaments[0].slug}`
                                : `/tournaments/${row.activity.slug}`
                            }
                            className="text-foreground hover:text-primary"
                          >
                            {row.activity.name}
                          </Link>
                        ) : (
                          row.name
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
