import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { isParticipating } from "@/lib/tournamentRoster";
import { SCORING_LABELS } from "@/lib/scoringLabels";

export default async function ActivityAdminPage({ params }: { params: Promise<{ activity: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN";

  const { activity: activityId } = await params;
  const [activity, seasons, schools] = await Promise.all([
    prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        // Only the activity's default template - each tournament has its
        // own independent copy, included with the tournament below.
        divisions: { where: { tournamentId: null } },
        tournaments: { orderBy: [{ archived: "asc" }, { startDate: "desc" }], include: { divisions: true } },
        fields: { orderBy: { order: "asc" } },
      },
    }),
    prisma.season.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!activity) notFound();

  const current = activity.tournaments.find((t) => t.isCurrent) ?? activity.tournaments[0];
  const past = activity.tournaments.filter((t) => t.id !== current?.id);

  const rosterRows = current
    ? await prisma.tournamentSchool.findMany({ where: { tournamentId: current.id }, select: { schoolId: true, participating: true } })
    : [];
  const overrides = new Map(rosterRows.map((r) => [r.schoolId, r.participating]));
  const schoolOptions = schools.map((school) => ({
    id: school.id,
    name: school.name,
    isLeagueMember: school.isLeagueMember,
    participating: isParticipating(school, overrides),
  }));
  const participatingCount = schoolOptions.filter((o) => o.participating).length;

  const sections = [
    current && { id: "current", label: "Current tournament" },
    past.length > 0 && { id: "past", label: "Past tournaments" },
    { id: "settings", label: "Activity settings" },
  ].filter(Boolean) as { id: string; label: string }[];

  return (
    <div className="page-wrap py-8">
      <Link href="/dashboard/admin/tournaments" className="text-sm font-semibold text-primary-dark hover:underline">
        &larr; All activities
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{activity.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {activity.sport} · {activity.usesGolfFormat
              ? "individual points by flight, then team match play"
              : activity.usesAcademicFormat
                ? "a day-by-day timeline, Varsity and JV side by side"
                : SCORING_LABELS[activity.scoringType]}
            {activity.divisions.length > 0 && ` · ${activity.divisions.map((d) => d.name).join(" & ")}`}
          </p>
        </div>
        <Link href={`/dashboard/admin/tournaments/${activity.id}/tournaments/new`} className="btn btn-secondary">
          {current ? "Start new tournament" : "Create first tournament"}
        </Link>
      </div>

      <div className="mt-6 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      {/* A row of jump links on narrow screens; a sticky sidebar on wide ones. */}
      <nav
        aria-label="On this page"
        className="flex flex-wrap gap-x-5 gap-y-1 border-y border-divider py-2.5 text-sm lg:sticky lg:top-6 lg:flex-col lg:self-start lg:border-y-0 lg:border-l-2 lg:py-0 lg:pl-4"
      >
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="font-semibold text-primary hover:underline lg:py-1">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-8 max-w-3xl space-y-12 lg:mt-0">
        {current ? (
          <section id="current" className="scroll-mt-4 space-y-6">
            <div>
              <h6 className="text-primary-dark">Current tournament</h6>
              <h2 className="mt-1 text-2xl">{current.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {format(current.startDate, "MMM d")} – {format(current.endDate, "MMM d, yyyy")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={`/seasons/${current.slug}`} className="btn btn-secondary">
                View public page
              </Link>
              {isAdmin && activity.usesGolfFormat && (
                <Link href={`/dashboard/admin/golf?tournament=${current.id}`} className="btn btn-primary">
                  Golf roster, draw &amp; scores
                </Link>
              )}
              {isAdmin && activity.usesAcademicFormat && (
                <Link href={`/dashboard/admin/academic-games?tournament=${current.id}`} className="btn btn-primary">
                  Academic Games schedule
                </Link>
              )}
              {!activity.usesMeetResults && !activity.usesGolfFormat && !activity.usesAcademicFormat && (
                <>
                  <Link href={`/dashboard/admin/events/import?tournament=${current.id}`} className="btn btn-secondary">
                    Upload schedule (CSV)
                  </Link>
                  <Link href={`/dashboard/admin/events/new?tournament=${current.id}`} className="btn btn-secondary">
                    + Add one game
                  </Link>
                </>
              )}
              {isAdmin && activity.usesMeetResults && (
                <Link href={`/dashboard/admin/meet-schedule?tournament=${current.id}`} className="btn btn-secondary">
                  Upload meet schedule &amp; program
                </Link>
              )}
              {isAdmin && (
                <Link href={`/dashboard/admin/tournament-photos/${current.id}`} className="btn btn-secondary">
                  Team photos
                </Link>
              )}
            </div>

            <Panel title="Dates, host & status">
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
                <div className="mt-6 border-t border-divider pt-4">
                  <LiveResultsPhotoManager tournamentId={current.id} photoUrl={current.liveResultsPhotoUrl} />
                </div>
              )}
            </Panel>

            <Panel title={`Participating schools (${participatingCount} of ${schoolOptions.length})`}>
              <TournamentSchoolsManager tournamentId={current.id} schools={schoolOptions} />
            </Panel>

            <Panel title={`Divisions (${current.divisions.length})`}>
              <DivisionsManager
                activityId={activity.id}
                tournamentId={current.id}
                divisions={current.divisions}
                usesMeetResults={activity.usesMeetResults}
              />
            </Panel>

            {isAdmin && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-danger">Delete this tournament</summary>
                <div className="mt-3">
                  <DeleteTournamentForm tournamentId={current.id} tournamentName={current.name} />
                </div>
              </details>
            )}
          </section>
        ) : (
          <p className="text-muted">No tournament created yet.</p>
        )}

        {past.length > 0 && (
          <section id="past" className="scroll-mt-4">
            <h6 className="mb-3 text-primary-dark">Past tournaments</h6>
            <ul className="card divide-y divide-border">
              {past.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <Link href={`/seasons/${t.slug}`} className="mr-auto font-semibold hover:underline">
                    {t.name}
                    <span className="ml-2 font-normal text-muted">
                      {format(t.startDate, "MMM yyyy")}
                    </span>
                  </Link>
                  <SetTournamentCurrentButton tournamentId={t.id} />
                  {isAdmin && (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-danger">Delete</summary>
                      <div className="mt-2">
                        <DeleteTournamentForm tournamentId={t.id} tournamentName={t.name} />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="settings" className="scroll-mt-4 space-y-6">
          <div>
            <h6 className="text-primary-dark">Activity settings</h6>
            <p className="mt-1 text-sm text-muted">Applies to every tournament of this activity, now and in future years.</p>
          </div>

          {isAdmin && (
            <Panel title="Name, sport & scoring">
              <ActivityForm
                seasons={seasons}
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
                  usesGolfFormat: activity.usesGolfFormat,
                  usesAcademicFormat: activity.usesAcademicFormat,
                }}
              />
            </Panel>
          )}

          <Panel title={`Default divisions for new tournaments (${activity.divisions.length})`}>
            <DivisionsManager
              activityId={activity.id}
              divisions={activity.divisions}
              usesMeetResults={activity.usesMeetResults}
            />
          </Panel>

          {isAdmin && (
            <Panel title={`Custom schedule fields (${activity.fields.length})`}>
              <ActivityFieldsManager activityId={activity.id} fields={activity.fields} />
            </Panel>
          )}

          {isAdmin && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-danger">Delete this activity</summary>
              <div className="mt-3">
                <DeleteActivityForm activityId={activity.id} activityName={activity.name} />
              </div>
            </details>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-4 text-base font-bold">{title}</h3>
      {children}
    </div>
  );
}
