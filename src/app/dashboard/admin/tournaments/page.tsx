import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ActivityForm } from "@/components/ActivityForm";
import { SeasonEditionForm } from "@/components/SeasonEditionForm";
import { ActivityFieldsManager } from "@/components/ActivityFieldsManager";
import { EXPECTED_ROSTER } from "@/lib/expectedRoster";

const SCORING_LABELS: Record<string, string> = {
  WIN_LOSS: "win/loss results",
  LOW_SCORE: "team + individual, lowest wins",
  NONE: "no results table",
};

export default async function TournamentsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [seasons, schools] = await Promise.all([
    prisma.season.findMany({
      orderBy: { order: "asc" },
      include: {
        activities: {
          orderBy: { name: "asc" },
          include: {
            divisions: true,
            tournaments: { orderBy: [{ archived: "asc" }, { startDate: "desc" }] },
            fields: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);
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
                              href={`/dashboard/admin/tournaments/${activity.id}/seasons/new`}
                              className="btn btn-secondary px-3 py-1 text-xs"
                            >
                              {current ? "Start new tournament" : "Create first tournament"}
                            </Link>
                            {current && (
                              <Link href={`/seasons/${current.slug}`} className="text-xs font-semibold text-primary hover:underline">
                                View public page →
                              </Link>
                            )}
                            {current && (
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
                                tournamentId={activity.id}
                                schools={schools}
                                existing={{
                                  id: current.id,
                                  name: current.name,
                                  startDate: format(current.startDate, "yyyy-MM-dd"),
                                  endDate: format(current.endDate, "yyyy-MM-dd"),
                                  hostSchoolId: current.hostSchoolId,
                                  archived: current.archived,
                                }}
                              />
                            </div>
                          )}

                          {archived.length > 0 && (
                            <div className="text-xs text-muted">
                              Archive:{" "}
                              {archived.map((t, i) => (
                                <span key={t.id}>
                                  {i > 0 && ", "}
                                  <Link href={`/seasons/${t.slug}`} className="underline">
                                    {t.name}
                                  </Link>
                                </span>
                              ))}
                            </div>
                          )}

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
                              defaultHostSchoolId: activity.defaultHostSchoolId,
                              showWins: activity.showWins,
                              showLosses: activity.showLosses,
                              showPointsFor: activity.showPointsFor,
                              showPointsAgainst: activity.showPointsAgainst,
                              showPlayed: activity.showPlayed,
                              usesSetScores: activity.usesSetScores,
                            }}
                          />

                          <details>
                            <summary className="cursor-pointer text-xs font-semibold text-muted">
                              Custom schedule fields ({activity.fields.length})
                            </summary>
                            <div className="mt-3">
                              <ActivityFieldsManager activityId={activity.id} fields={activity.fields} />
                            </div>
                          </details>
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

      <div>
        <h2 className="mb-1 text-xl font-bold">Create an activity</h2>
        <p className="mb-6 text-sm text-muted">
          For a new sport or division not already listed above — most years won&apos;t need this.
        </p>
        <ActivityForm seasons={seasons.map((s) => ({ id: s.id, name: s.name }))} schools={schools} />
      </div>
    </div>
  );
}
