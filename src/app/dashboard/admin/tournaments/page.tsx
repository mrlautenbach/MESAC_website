import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ActivityForm } from "@/components/ActivityForm";
import { SeasonEditionForm } from "@/components/SeasonEditionForm";
import { ActivityFieldsManager } from "@/components/ActivityFieldsManager";
import { DivisionsManager } from "@/components/DivisionsManager";
import { TournamentSchoolsManager } from "@/components/TournamentSchoolsManager";
import { LiveResultsPhotoManager } from "@/components/LiveResultsPhotoManager";
import { DeleteActivityForm } from "@/components/DeleteActivityForm";
import { DeleteTournamentForm } from "@/components/DeleteTournamentForm";
import { SetTournamentCurrentButton } from "@/components/SetTournamentCurrentButton";
import { EXPECTED_ROSTER } from "@/lib/expectedRoster";
import { isParticipating } from "@/lib/tournamentRoster";

const SCORING_LABELS: Record<string, string> = {
  WIN_LOSS: "win/loss results",
  LOW_SCORE: "team + individual, lowest wins",
  NONE: "no results table",
};

export default async function TournamentsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN";

  const [seasons, schools, rosterRows] = await Promise.all([
    prisma.season.findMany({
      orderBy: { order: "asc" },
      include: {
        activities: {
          orderBy: { name: "asc" },
          include: {
            // Only the activity's default template - each tournament has
            // its own independent copy, fetched separately below.
            divisions: { where: { tournamentId: null } },
            tournaments: {
              orderBy: [{ archived: "asc" }, { startDate: "desc" }],
              include: { divisions: true },
            },
            fields: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
    prisma.tournamentSchool.findMany({ select: { tournamentId: true, schoolId: true, participating: true } }),
  ]);
  // One query for every tournament's overrides, resolved per tournament below,
  // rather than a roster query inside the activity loop.
  const overridesByTournament = new Map<string, Map<string, boolean>>();
  for (const row of rosterRows) {
    const map = overridesByTournament.get(row.tournamentId) ?? new Map<string, boolean>();
    map.set(row.schoolId, row.participating);
    overridesByTournament.set(row.tournamentId, map);
  }
  const activityCount = seasons.reduce((n, s) => n + s.activities.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <h1 className="mb-4 text-2xl font-bold">Activities ({activityCount})</h1>
        <p className="mb-6 text-sm text-muted">
          Start or manage this year&apos;s tournament for each activity below. New activities are rare once the
          year&apos;s roster is set up.
        </p>
        <div className="space-y-8">
          {seasons.map((season) => (
            <div key={season.id}>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{season.name}</h3>
              {(() => {
                const existingNames = new Set(season.activities.map((a) => a.name.trim().toLowerCase()));
                const missing = EXPECTED_ROSTER.filter(
                  (e) => e.seasonOrder === season.order && !existingNames.has(e.name.trim().toLowerCase())
                );
                if (missing.length === 0) return null;
                return (
                  <p className="mb-4 text-sm text-muted">
                    Not set up yet: {missing.map((e) => e.name).join(", ")}. Use the &quot;Create an activity&quot; form
                    below to create each one.
                  </p>
                );
              })()}
              <div className="space-y-6">
                {season.activities.length === 0 ? (
                  <p className="text-sm text-muted">No activities in this season yet.</p>
                ) : (
                  season.activities.map((activity) => {
                    const current = activity.tournaments.find((t) => t.isCurrent) ?? activity.tournaments[0];
                    const archived = activity.tournaments.filter((t) => t.id !== current?.id);
                    return (
                      <details key={activity.id} className="card p-4">
                        <summary className="cursor-pointer font-semibold">
                          {activity.name}{" "}
                          <span className="font-normal text-muted">
                            · {activity.sport} · {SCORING_LABELS[activity.scoringType]}
                            {activity.divisions.length > 0 && ` · ${activity.divisions.map((d) => d.name).join(" & ")}`}
                          </span>
                        </summary>
                        <div className="mt-4 space-y-4">
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            {current ? (
                              <span className="text-muted">
                                Current tournament: <span className="font-medium text-foreground">{current.name}</span> (
                                {format(current.startDate, "MMM d")} – {format(current.endDate, "MMM d, yyyy")})
                              </span>
                            ) : (
                              <span className="text-muted">No tournament created yet.</span>
                            )}
                            <Link
                              href={`/dashboard/admin/tournaments/${activity.id}/tournaments/new`}
                              className="btn btn-secondary px-3 py-1 text-xs"
                            >
                              {current ? "Start new tournament" : "Create first tournament"}
                            </Link>
                            {current && (
                              <Link href={`/seasons/${current.slug}`} className="text-xs font-semibold text-primary hover:underline">
                                View public page →
                              </Link>
                            )}
                            {current && !activity.usesMeetResults && (
                              <Link
                                href={`/dashboard/admin/events/import?tournament=${current.id}`}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Upload/edit schedule (CSV) →
                              </Link>
                            )}
                            {current && !activity.usesMeetResults && (
                              <Link
                                href={`/dashboard/admin/events/new?tournament=${current.id}`}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                + Add one game →
                              </Link>
                            )}
                            {current && isAdmin && activity.usesMeetResults && (
                              <Link
                                href={`/dashboard/admin/meet-schedule?tournament=${current.id}`}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Upload meet schedule &amp; program →
                              </Link>
                            )}
                            {current && isAdmin && (
                              <Link
                                href={`/dashboard/admin/tournament-photos/${current.id}`}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Manage team photos →
                              </Link>
                            )}
                          </div>

                          {current && (
                            <div>
                              <p className="mb-2 text-xs font-semibold text-muted">Edit current tournament&apos;s dates/host</p>
                              <SeasonEditionForm
                                activityId={activity.id}
                                schools={schools}
                                showLiveResults={activity.usesLiveResults}
                                existing={{
                                  id: current.id,
                                  name: current.name,
                                  startDate: format(current.startDate, "yyyy-MM-dd"),
                                  endDate: format(current.endDate, "yyyy-MM-dd"),
                                  hostSchoolId: current.hostSchoolId,
                                  archived: current.archived,
                                  liveResultsUrl: current.liveResultsUrl,
                                  liveResultsText: current.liveResultsText,
                                }}
                              />
                              {activity.usesLiveResults && (
                                <div className="mt-3">
                                  <LiveResultsPhotoManager
                                    tournamentId={current.id}
                                    photoUrl={current.liveResultsPhotoUrl}
                                  />
                                </div>
                              )}
                              {isAdmin && (
                                <details className="mt-3">
                                  <summary className="cursor-pointer text-xs font-semibold text-danger">
                                    Delete this tournament
                                  </summary>
                                  <div className="mt-3">
                                    <DeleteTournamentForm tournamentId={current.id} tournamentName={current.name} />
                                  </div>
                                </details>
                              )}
                            </div>
                          )}

                          {archived.length > 0 && (
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold text-muted">Archive:</p>
                              {archived.map((t) => (
                                <div key={t.id} className="flex flex-wrap items-center gap-2">
                                  <Link href={`/seasons/${t.slug}`} className="text-muted underline">
                                    {t.name}
                                  </Link>
                                  <SetTournamentCurrentButton tournamentId={t.id} />
                                  {isAdmin && (
                                    <details>
                                      <summary className="cursor-pointer font-semibold text-danger">Delete</summary>
                                      <div className="mt-2">
                                        <DeleteTournamentForm tournamentId={t.id} tournamentName={t.name} />
                                      </div>
                                    </details>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {isAdmin && (
                            <ActivityForm
                              seasons={seasons.map((s) => ({ id: s.id, name: s.name }))}
                              schools={schools}
                              existing={{
                                id: activity.id,
                                name: activity.name,
                                sport: activity.sport,
                                scoringType: activity.scoringType,
                                winPoints: activity.winPoints,
                                drawPoints: activity.drawPoints,
                                lossPoints: activity.lossPoints,
                                seasonId: activity.seasonId,
                                showWins: activity.showWins,
                                showLosses: activity.showLosses,
                                showPointsFor: activity.showPointsFor,
                                showPointsAgainst: activity.showPointsAgainst,
                                showPlayed: activity.showPlayed,
                                usesSetScores: activity.usesSetScores,
                                usesMeetResults: activity.usesMeetResults,
                                usesLiveResults: activity.usesLiveResults,
                              }}
                            />
                          )}

                          {current && (() => {
                            const overrides = overridesByTournament.get(current.id) ?? new Map<string, boolean>();
                            const options = schools.map((school) => ({
                              id: school.id,
                              name: school.name,
                              isLeagueMember: school.isLeagueMember,
                              participating: isParticipating(school, overrides),
                            }));
                            const inCount = options.filter((o) => o.participating).length;
                            return (
                              <details>
                                <summary className="cursor-pointer text-xs font-semibold text-muted">
                                  Participating schools ({inCount} of {options.length})
                                </summary>
                                <div className="mt-3">
                                  <TournamentSchoolsManager tournamentId={current.id} schools={options} />
                                </div>
                              </details>
                            );
                          })()}

                          {current && (
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-muted">
                                This tournament&apos;s divisions ({current.divisions.length})
                              </summary>
                              <div className="mt-3">
                                <DivisionsManager
                                  activityId={activity.id}
                                  tournamentId={current.id}
                                  divisions={current.divisions}
                                  usesMeetResults={activity.usesMeetResults}
                                />
                              </div>
                            </details>
                          )}

                          <details>
                            <summary className="cursor-pointer text-xs font-semibold text-muted">
                              Default divisions for new tournaments ({activity.divisions.length})
                            </summary>
                            <div className="mt-3">
                              <DivisionsManager
                                activityId={activity.id}
                                divisions={activity.divisions}
                                usesMeetResults={activity.usesMeetResults}
                              />
                            </div>
                          </details>

                          {isAdmin && (
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-muted">
                                Custom schedule fields ({activity.fields.length})
                              </summary>
                              <div className="mt-3">
                                <ActivityFieldsManager activityId={activity.id} fields={activity.fields} />
                              </div>
                            </details>
                          )}

                          {isAdmin && (
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-danger">Delete activity</summary>
                              <div className="mt-3">
                                <DeleteActivityForm activityId={activity.id} activityName={activity.name} />
                              </div>
                            </details>
                          )}
                        </div>
                      </details>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div>
          <h2 className="mb-1 text-xl font-bold">Create an activity</h2>
          <p className="mb-6 text-sm text-muted">
            For a new sport or division not already listed above. Most years won&apos;t need this.
          </p>
          <ActivityForm seasons={seasons.map((s) => ({ id: s.id, name: s.name }))} schools={schools} />
        </div>
      )}
    </div>
  );
}
