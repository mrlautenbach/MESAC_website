import Link from "next/link";
import { format } from "date-fns";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AcademicCsvForm, BowlScoresForm } from "@/components/AcademicGamesForms";
import { RUN_BY_FIELD, formatTimeRange, sortDivisions } from "@/lib/academicGames";
import { FINALS_STAGES, gameLabel, sourceLabel, teamLabel, type BowlStage } from "@/lib/bowl";

const STAGE_ORDER: BowlStage[] = ["ROUND_ROBIN", ...FINALS_STAGES.map((f) => f.stage)];

// Everything for an Academic Games tournament: the day-by-day schedule, and
// the Academic Bowl's games and scores - each by CSV, and the scores round
// by round too.
export default async function AcademicGamesAdminPage({ searchParams }: { searchParams: Promise<{ tournament?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return (
      <div className="page-wrap py-10 [&>*]:max-w-2xl">
        <p className="text-danger">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const { tournament: tournamentId } = await searchParams;
  if (!tournamentId) notFound();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: {
        orderBy: { date: "asc" },
        include: { division: true, fieldValues: { where: { field: { key: RUN_BY_FIELD.key } } } },
      },
      bowlTeams: true,
      bowlGames: {
        orderBy: [{ startTime: "asc" }, { room: "asc" }],
        include: { teamA: { include: { school: true } }, teamB: { include: { school: true } } },
      },
    },
  });
  if (!tournament) notFound();
  if (!tournament.activity.usesAcademicFormat) {
    return (
      <div className="page-wrap py-8 [&>*]:max-w-2xl">
        <p className="text-danger">This activity doesn&apos;t use the Academic Games format.</p>
      </div>
    );
  }

  const divisions = sortDivisions(tournament.divisions);
  const rank = new Map(divisions.map((d, i) => [d.id, i + 1]));
  const events = [...tournament.events].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (rank.get(a.divisionId ?? "") ?? 0) - (rank.get(b.divisionId ?? "") ?? 0)
  );
  const days = [...new Set(events.map((e) => format(e.date, "yyyy-MM-dd")))];
  const noVenue = events.filter((e) => !e.location).length;
  const example = (file: string) => `/dashboard/admin/academic-games/examples?tournament=${tournament.id}&file=${file}`;

  const games = tournament.bowlGames;
  const scored = games.filter((g) => g.scoreA !== null).length;
  // Each division's games, grouped into its rounds and finals games in order.
  const bowlDivisions = divisions
    .map((division) => {
      const own = games.filter((g) => g.divisionId === division.id);
      const groups = new Map<string, { stage: BowlStage; number: number; games: typeof own }>();
      for (const g of own) {
        const key = g.stage === "ROUND_ROBIN" ? `RR${g.number}` : g.stage;
        const group = groups.get(key) ?? { stage: g.stage, number: g.number, games: [] };
        group.games.push(g);
        groups.set(key, group);
      }
      const rounds = [...groups.values()].sort(
        (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.number - b.number
      );
      return {
        division,
        rounds,
        teams: tournament.bowlTeams.filter((t) => t.divisionId === division.id).length,
        scored: own.filter((g) => g.scoreA !== null).length,
        total: own.length,
      };
    })
    .filter((d) => d.total > 0);
  const roundTitle = (stage: BowlStage, number: number) =>
    stage === "ROUND_ROBIN" ? gameLabel(stage, number) : FINALS_STAGES.find((f) => f.stage === stage)!.label + (stage === "QUARTERFINAL" || stage === "SEMIFINAL" ? "s" : "");

  return (
    <div className="page-wrap space-y-10 py-8 [&>*]:max-w-3xl">
      <div>
        <Link href={`/dashboard/admin/tournaments/${tournament.activityId}`} className="text-sm font-semibold text-primary-dark hover:underline">
          ← {tournament.activity.name}
        </Link>
        <h1 className="mt-2 text-2xl">
          {tournament.activity.name} <span className="font-normal text-muted">· {tournament.name}</span>
        </h1>
        <nav aria-label="Steps" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <a href="#schedule" className="font-semibold text-primary hover:underline">Schedule</a>
          <a href="#bowl" className="font-semibold text-primary hover:underline">Academic Bowl</a>
          {games.length > 0 && <a href="#bowl-scores" className="font-semibold text-primary hover:underline">Bowl scores</a>}
          <Link href={`/seasons/${tournament.slug}/schedule`} className="ml-auto font-semibold text-primary hover:underline">
            View public schedule →
          </Link>
        </nav>
      </div>

      <section id="schedule" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">1. Schedule ({events.length} competitions)</h2>
          <p className="mt-1 text-sm text-muted">
            One row per competition. Columns: <code>date</code> (YYYY-MM-DD), <code>start</code> and{" "}
            <code>end</code> (13:45 or 1:45pm), <code>title</code>, <code>team</code> (<code>varsity</code>,{" "}
            <code>jv</code>, or blank when every team takes part), <code>venue</code>, and <code>run_by</code> (the
            school running it, e.g. AS Dubai). The Varsity and JV divisions are added the first time the file uses
            them.
          </p>
          <p className="mt-1 text-sm text-muted">
            The file is the whole schedule: re-uploading updates each competition in place (matched by its date,
            title and team) and removes any that are no longer in it. The{" "}
            <a href={example("schedule")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            {events.length
              ? "is the schedule as it stands - download it, edit it, and upload it again."
              : "is the 2025 schedule's competitions moved onto this tournament's dates - fill in the venues and adjust the times."}
          </p>
        </div>
        <AcademicCsvForm
          kind="schedule"
          tournamentId={tournament.id}
          exampleHref={example("schedule")}
          placeholder={`date,start,end,title,team,venue,run_by\n2026-10-30,09:25,10:15,Math Challenge,varsity,Library,AS Dubai`}
        />

        {events.length > 0 && (
          <details className="card p-4">
            <summary className="cursor-pointer font-semibold">
              Current schedule
              {noVenue > 0 && <span className="font-normal text-muted"> · {noVenue} without a venue yet</span>}
            </summary>
            <div className="mt-3 space-y-4">
              {days.map((day) => (
                <div key={day}>
                  <h3 className="mb-2 text-sm">{format(new Date(`${day}T00:00:00`), "EEEE d MMMM")}</h3>
                  <div className="overflow-x-auto">
                    <table className="mtable text-sm">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Team</th>
                          <th>Competition</th>
                          <th>Venue</th>
                          <th>
                            <span className="sr-only">Edit</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {events
                          .filter((e) => format(e.date, "yyyy-MM-dd") === day)
                          .map((e) => (
                            <tr key={e.id}>
                              <td className="whitespace-nowrap tabular-nums">{formatTimeRange(e.date, e.endDate)}</td>
                              <td className="whitespace-nowrap">{e.division?.name ?? "All teams"}</td>
                              <td>
                                <span className="font-semibold">{e.title}</span>
                                {e.fieldValues[0] && <span className="text-muted"> · run by {e.fieldValues[0].value}</span>}
                              </td>
                              <td className={e.location ? "" : "text-muted"}>{e.location ?? "TBC"}</td>
                              <td className="text-right">
                                <Link href={`/dashboard/events/${e.id}`} className="font-semibold text-primary hover:underline">
                                  Edit
                                </Link>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section id="bowl" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">
            2. Academic Bowl ({games.length} games{games.length > 0 ? `, ${scored} scored` : ""})
          </h2>
          <p className="mt-1 text-sm text-muted">
            One row per game, as on the bowl sheet. Columns: <code>division</code> (<code>varsity</code> or{" "}
            <code>jv</code>), <code>round</code> (1-24, or <code>QF1</code>-<code>QF4</code>, <code>SF1</code>,{" "}
            <code>SF2</code>, <code>Consolation</code>, <code>Final</code>), <code>date</code>, <code>time</code>,{" "}
            <code>team_a</code>, <code>team_b</code>, and optional <code>room</code>, <code>score_a</code> and{" "}
            <code>score_b</code>. Write teams as the sheet does, the school then its colour (&quot;ASDubai
            Blue&quot;, &quot;ABA Red&quot;). A finals team can be where it comes from instead:{" "}
            <code>seed 1</code>, <code>winner QF1</code>, <code>loser SF2</code>.
          </p>
          <p className="mt-1 text-sm text-muted">
            For each division in the file, the file is that division&apos;s whole bowl: games are matched by round and
            teams and updated in place, and ones no longer in it are removed. A blank score leaves a score already
            entered alone, so the same file can be uploaded again with more scores filled in. The{" "}
            <a href={example("bowl")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            {games.length
              ? "is the bowl as it stands, with its scores."
              : "is a full sample: each league school's Red and Blue teams playing everyone but their own school's other team twice, timed to the schedule's Academic Bowl blocks, then the seeded finals."}
          </p>
        </div>
        <AcademicCsvForm
          kind="bowl"
          tournamentId={tournament.id}
          exampleHref={example("bowl")}
          placeholder={`division,round,date,time,team_a,team_b,room,score_a,score_b\njv,1,2026-10-30,08:30,ASDubai Blue,ABA Blue,2205,21,8\njv,QF1,2026-11-01,10:30,seed 1,seed 8,Theater,,`}
        />
      </section>

      {bowlDivisions.length > 0 && (
        <section id="bowl-scores" className="scroll-mt-20 space-y-6">
          <div>
            <h2 className="text-xl">3. Bowl scores</h2>
            <p className="mt-1 text-sm text-muted">
              Round by round. Leave both boxes blank for a game that hasn&apos;t been played. Finals games can be
              scored once both their teams are known.
            </p>
          </div>
          {bowlDivisions.map(({ division, rounds, teams, scored: done, total }) => {
            const firstOpen = rounds.find((r) => r.games.some((g) => g.scoreA === null && g.teamAId && g.teamBId));
            return (
              <div key={division.id} className="space-y-2">
                <h3>
                  {division.name}{" "}
                  <span className="font-normal text-muted">
                    · {teams} teams · {done} of {total} games scored
                  </span>
                </h3>
                {rounds.map((round) => {
                  const roundScored = round.games.filter((g) => g.scoreA !== null).length;
                  return (
                    <details key={`${round.stage}-${round.number}`} open={round === firstOpen} className="card px-4 py-2">
                      <summary className="cursor-pointer text-sm">
                        <span className="font-semibold">{roundTitle(round.stage, round.number)}</span>
                        <span className="text-muted">
                          {" "}
                          · {format(round.games[0].startTime, "EEE h:mmaaa")} · {roundScored}/{round.games.length} scored
                        </span>
                      </summary>
                      <div className="mt-2">
                        <BowlScoresForm
                          games={round.games.map((g) => ({
                            id: g.id,
                            room: round.stage === "ROUND_ROBIN" ? g.room : gameLabel(g.stage, g.number),
                            teamA: g.teamA ? teamLabel(g.teamA) : sourceLabel(g.sourceA ?? "TBD"),
                            teamB: g.teamB ? teamLabel(g.teamB) : sourceLabel(g.sourceB ?? "TBD"),
                            scoreA: g.scoreA,
                            scoreB: g.scoreB,
                            ready: !!(g.teamAId && g.teamBId),
                          }))}
                        />
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
