import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TournamentForm } from "@/components/TournamentForm";
import { SeasonEditionForm } from "@/components/SeasonEditionForm";

const SCORING_LABELS: Record<string, string> = {
  WIN_LOSS: "win/loss standings",
  LOW_SCORE: "team + individual, lowest wins",
  NONE: "no standings table",
};

export default async function TournamentsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [tournaments, schools] = await Promise.all([
    prisma.tournament.findMany({
      orderBy: { name: "asc" },
      include: {
        divisions: true,
        seasons: { orderBy: { startDate: "desc" } },
      },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <h1 className="mb-6 text-2xl font-bold">Create a tournament</h1>
        <TournamentForm />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold">Tournaments ({tournaments.length})</h2>
        <div className="space-y-6">
          {tournaments.map((tournament) => {
            const current = tournament.seasons.find((s) => s.isCurrent) ?? tournament.seasons[0];
            const archived = tournament.seasons.filter((s) => s.id !== current?.id);
            return (
              <details key={tournament.id} className="card p-4">
                <summary className="cursor-pointer font-semibold">
                  {tournament.name}{" "}
                  <span className="font-normal text-muted">
                    · {tournament.sport} · {SCORING_LABELS[tournament.scoringType]}
                    {tournament.divisions.length > 0 && ` · ${tournament.divisions.map((d) => d.name).join(" & ")}`}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {current ? (
                      <span className="text-muted">
                        Current season: <span className="font-medium text-foreground">{current.name}</span> (
                        {format(current.startDate, "MMM d")} – {format(current.endDate, "MMM d, yyyy")})
                      </span>
                    ) : (
                      <span className="text-muted">No season created yet.</span>
                    )}
                    <Link
                      href={`/dashboard/admin/tournaments/${tournament.id}/seasons/new`}
                      className="btn btn-secondary px-3 py-1 text-xs"
                    >
                      {current ? "Start new season" : "Create first season"}
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
                        Edit current season&apos;s dates/host
                      </summary>
                      <div className="mt-3">
                        <SeasonEditionForm
                          tournamentId={tournament.id}
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
                      {archived.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ", "}
                          <Link href={`/seasons/${s.slug}`} className="underline">
                            {s.name}
                          </Link>
                        </span>
                      ))}
                    </div>
                  )}

                  <TournamentForm
                    existing={{
                      id: tournament.id,
                      name: tournament.name,
                      sport: tournament.sport,
                      scoringType: tournament.scoringType,
                      winPoints: tournament.winPoints,
                      drawPoints: tournament.drawPoints,
                      lossPoints: tournament.lossPoints,
                    }}
                  />
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
