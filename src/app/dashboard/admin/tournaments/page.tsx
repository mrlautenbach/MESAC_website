import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ActivityForm } from "@/components/ActivityForm";
import { SeasonEditionForm } from "@/components/SeasonEditionForm";
import { ActivityFieldsManager } from "@/components/ActivityFieldsManager";

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
            tournaments: { orderBy: { startDate: "desc" } },
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
        <h1 className="mb-6 text-2xl font-bold">Create an activity</h1>
        <ActivityForm seasons={seasons.map((s) => ({ id: s.id, name: s.name }))} />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">Activities ({activityCount})</h2>
        <div className="space-y-8">
          {seasons.map((season) => (
            <div key={season.id}>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{season.name}</h3>
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
                          </div>

                          {current && (
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-muted">
                                Edit current tournament&apos;s dates/host
                              </summary>
                              <div className="mt-3">
                                <SeasonEditionForm
                                  tournamentId={activity.id}
                                  schools={schools}
                                  existing={{
                                    id: current.id,
                                    name: current.name,
                                    startDate: format(current.startDate, "yyyy-MM-dd"),
                                    endDate: format(current.endDate, "yyyy-MM-dd"),
                                    hostSchoolId: current.hostSchoolId,
                                  }}
                                />
                              </div>
                            </details>
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
                            existing={{
                              id: activity.id,
                              name: activity.name,
                              sport: activity.sport,
                              scoringType: activity.scoringType,
                              winPoints: activity.winPoints,
                              drawPoints: activity.drawPoints,
                              lossPoints: activity.lossPoints,
                              seasonId: activity.seasonId,
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
    </div>
  );
}
