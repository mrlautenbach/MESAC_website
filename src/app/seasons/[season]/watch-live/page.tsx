import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { SchoolBadge } from "@/components/SchoolBadge";
import { sideLabel } from "@/lib/eventDisplay";
import { LiveIcon } from "@/components/icons/LiveIcon";
import { divisionTagClass } from "@/lib/divisionTagClass";
import { StatusTag } from "@/components/TournamentGames";

export const dynamic = "force-dynamic";

// One combined list of every stream link for the whole tournament - both
// divisions together, since a stream is watched the same way regardless of
// which side of the bracket it's on. No scores here; that's the Results
// page's job.
export default async function WatchLivePage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();

  const hasDivisions = tournament.divisions.length > 0;

  const events = await prisma.event.findMany({
    // Every event with a stream link, regardless of status - each row
    // shows its own status tag so a completed or cancelled game reads as
    // such instead of being hidden entirely.
    where: { tournamentId: tournament.id, streamUrl: { not: null } },
    orderBy: { date: "asc" },
    include: {
      participants: { include: { school: true } },
      division: true,
      homeSourceEvent: { select: { externalId: true } },
      awaySourceEvent: { select: { externalId: true } },
    },
  });

  // Grouped by calendar day, same as the schedule/results tables.
  const dayGroups: { key: string; events: typeof events }[] = [];
  const dayIndexByKey = new Map<string, number>();
  for (const event of events) {
    const key = format(event.date, "yyyy-MM-dd");
    if (!dayIndexByKey.has(key)) {
      dayIndexByKey.set(key, dayGroups.length);
      dayGroups.push({ key, events: [] });
    }
    dayGroups[dayIndexByKey.get(key)!].events.push(event);
  }

  return (
    <div>
      <SeasonHero
        activityName={tournament.activity.name}
        activitySport={tournament.activity.sport}
        activitySlug={tournament.activity.slug}
        tournamentName={tournament.name}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        hostSchoolName={tournament.hostSchool?.name}
        hostSchoolLogoUrl={tournament.hostSchool?.logoUrl}
        archived={tournament.archived}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <TournamentSubNav tournamentSlug={tournament.slug} active="watch-live" />
        <h4 className="mb-3">Watch live</h4>

        {events.length === 0 ? (
          <p className="text-muted">No live streams have been added yet.</p>
        ) : (
          <>
            {/* Below sm: one card per game. */}
            <div className="space-y-3 sm:hidden">
              {events.map((event) => {
                const home = event.participants.find((p) => p.isHome);
                const away = event.participants.find((p) => !p.isHome);
                return (
                  <div key={event.id} className="card p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>
                        {format(event.date, "MMM d, yyyy")} · {format(event.date, "h:mm a")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {event.division && <span className={`tag ${divisionTagClass(event.division.name)}`}>{event.division.name}</span>}
                        <StatusTag status={event.status} />
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 font-extrabold">
                        <SchoolBadge
                          size={36}
                          logoUrl={home?.school.logoUrl}
                          name={home?.school.name ?? "TBD"}
                          color={home?.school.themeColor}
                          secondaryColor={home?.school.themeColorSecondary}
                        />
                        {sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)}
                      </div>
                      <div className="flex items-center gap-1 font-extrabold">
                        <SchoolBadge
                          size={36}
                          logoUrl={away?.school.logoUrl}
                          name={away?.school.name ?? "TBD"}
                          color={away?.school.themeColor}
                          secondaryColor={away?.school.themeColorSecondary}
                        />
                        {sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId)}
                      </div>
                    </div>
                    <a
                      href={event.streamUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tag tag-accent mt-2 inline-flex gap-1"
                    >
                      <LiveIcon />
                      Watch live
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Desktop: grouped by day, same layout as schedule/results. */}
            <div className="hidden space-y-6 sm:block">
              {dayGroups.map((group) => (
                <div key={group.key}>
                  <h5 className="mb-2 border-b-2 border-divider pb-1.5 text-sm font-bold text-primary-dark">
                    {format(group.events[0].date, "EEEE, MMM d, yyyy")}
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="mtable">
                      <thead>
                        <tr>
                          {hasDivisions && <th>Division</th>}
                          <th>Home</th>
                          <th>Away</th>
                          <th>Time</th>
                          <th>Status</th>
                          <th>Watch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.events.map((event) => {
                          const home = event.participants.find((p) => p.isHome);
                          const away = event.participants.find((p) => !p.isHome);
                          return (
                            <tr key={event.id}>
                              {hasDivisions && (
                                <td>
                                  {event.division && (
                                    <span className={`tag ${divisionTagClass(event.division.name)}`}>{event.division.name}</span>
                                  )}
                                </td>
                              )}
                              <td className="font-extrabold">
                                <span className="inline-flex items-center gap-1">
                                  <SchoolBadge
                                    size={36}
                                    logoUrl={home?.school.logoUrl}
                                    name={home?.school.name ?? "TBD"}
                                    color={home?.school.themeColor}
                                    secondaryColor={home?.school.themeColorSecondary}
                                  />
                                  {sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)}
                                </span>
                              </td>
                              <td className="font-extrabold">
                                <span className="inline-flex items-center gap-1">
                                  <SchoolBadge
                                    size={36}
                                    logoUrl={away?.school.logoUrl}
                                    name={away?.school.name ?? "TBD"}
                                    color={away?.school.themeColor}
                                    secondaryColor={away?.school.themeColorSecondary}
                                  />
                                  {sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId)}
                                </span>
                              </td>
                              <td className="text-muted tabular-nums">{format(event.date, "h:mm a")}</td>
                              <td>
                                <StatusTag status={event.status} />
                              </td>
                              <td>
                                <a
                                  href={event.streamUrl!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="tag tag-accent gap-1"
                                >
                                  <LiveIcon />
                                  Watch live
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
