import Link from "next/link";
import { format } from "date-fns";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { GolfCsvForm, GolfGroupScoresForm, GolfMatchResultsForm } from "@/components/GolfAdminForms";
import { GOLF_FLIGHTS, formatGolfPoints, matchScore, pairName } from "@/lib/golf";

// Everything for a golf tournament, in the order it happens: Day 1's
// roster, tee-time draw and scores, then the team match play's draw and
// results - each by CSV, or group by group / match by match.
export default async function GolfAdminPage({ searchParams }: { searchParams: Promise<{ tournament?: string }> }) {
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
      golfPlayers: { orderBy: [{ school: { name: "asc" } }, { seed: "asc" }], include: { school: true } },
      golfGroups: {
        orderBy: { number: "asc" },
        include: { players: { orderBy: [{ school: { name: "asc" } }], include: { school: true } } },
      },
      golfMatches: {
        orderBy: [{ round: "asc" }, { startTime: "asc" }],
        include: { homeSchool: true, awaySchool: true, pairs: { orderBy: { flight: "asc" } } },
      },
    },
  });
  if (!tournament) notFound();
  if (!tournament.activity.usesGolfFormat) {
    return (
      <div className="page-wrap py-8 [&>*]:max-w-2xl">
        <p className="text-danger">This activity doesn&apos;t use the golf format.</p>
      </div>
    );
  }

  const label = (school: { code: string | null; name: string }) => school.code || school.name;
  const players = tournament.golfPlayers;
  const bySchool = new Map<string, typeof players>();
  for (const p of players) bySchool.set(p.schoolId, [...(bySchool.get(p.schoolId) ?? []), p]);
  const scored = players.filter((p) => p.points !== null).length;
  const ungrouped = players.filter((p) => !p.groupId);

  const schoolCodes = (await prisma.school.findMany({ where: { isLeagueMember: true }, orderBy: { name: "asc" } })).map(label);
  const [a = "ABA", b = "ACS"] = schoolCodes;
  const day = format(tournament.startDate, "yyyy-MM-dd");
  const templates = {
    roster: `school,seed,name,grade,gender\n${a},1,First Player,11,M\n${a},2,Second Player,11,F\n${b},1,First Player,12,M\n`,
    draw: `date,flight,group,tee_time,school,seed,marshal,course\n${day},1,1,08:30,${a},1,Coach Name (${b}),Championship Course\n${day},1,1,08:30,${b},1,,\n${day},2,4,09:00,${a},3,,\n`,
    scores: `school,seed,points\n${a},1,48\n${a},2,29\n${b},1,46\n`,
    teamDraw: `round,date,time,home,away,flight,start_hole,marshal,course\n1,${day},07:30,${a},${b},1,1,Coach Name,Academy Course\n1,${day},07:30,${a},${b},2,2,Coach Name,\n1,${day},07:30,${a},${b},3,3,Coach Name,\n`,
    teamResults: `round,home,away,flight,winner,margin\n1,${a},${b},1,${b},3 up\n1,${a},${b},2,halved,\n1,${a},${b},3,${a},2&1\n`,
  };
  const matches = tournament.golfMatches;
  const rounds = [...new Set(matches.map((m) => m.round))];
  const pairsIn = matches.reduce((n, m) => n + m.pairs.filter((p) => p.winner).length, 0);
  const pairsTotal = matches.reduce((n, m) => n + m.pairs.length, 0);
  const example = (file: string) => `/dashboard/admin/golf/examples?tournament=${tournament.id}&file=${file}`;

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
          <span className="font-semibold text-muted">Day 1:</span>
          <a href="#roster" className="font-semibold text-primary hover:underline">Roster</a>
          <a href="#draw" className="font-semibold text-primary hover:underline">Draw</a>
          <a href="#scores" className="font-semibold text-primary hover:underline">Scores</a>
          <span className="font-semibold text-muted">Team:</span>
          <a href="#team-draw" className="font-semibold text-primary hover:underline">Draw</a>
          <a href="#team-results" className="font-semibold text-primary hover:underline">Results</a>
          <Link href={`/seasons/${tournament.slug}/results`} className="ml-auto font-semibold text-primary hover:underline">
            View public results →
          </Link>
        </nav>
      </div>

      <section id="roster" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">1. Roster ({players.length} players)</h2>
          <p className="mt-1 text-sm text-muted">
            Columns: <code>school</code> (code or name), <code>seed</code> (1–6 within the school),{" "}
            <code>name</code>, and optional <code>grade</code> and <code>gender</code> (M/F). Seeds 1–2 play Flight
            1, 3–4 Flight 2 and 5–6 Flight 3. Players are matched by school and seed, so re-uploading a corrected
            file fixes names instead of adding players.
          </p>
          <p className="mt-1 text-sm text-muted">
            The{" "}
            <a href={example("roster")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            {players.length
              ? "is today's roster - download it, correct it, and upload it again."
              : "has six sample players per school with the site's school codes - replace the names and keep the layout."}
          </p>
        </div>
        {players.length > 0 && (
          <div className="card grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
            {[...bySchool.values()].map((own) => (
              <div key={own[0].schoolId}>
                <h3 className="text-sm">
                  {own[0].school.name} <span className="font-normal text-muted">({own.length})</span>
                </h3>
                <ol className="mt-1 space-y-0.5 text-sm">
                  {own.map((p) => (
                    <li key={p.id} className="flex gap-2">
                      <span className="w-5 text-right tabular-nums text-muted">{p.seed}</span>
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-muted">
                        {[p.grade && `Gr ${p.grade}`, p.gender].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        <details className="card p-4" open={players.length === 0}>
          <summary className="cursor-pointer font-semibold text-primary">{players.length ? "Upload a new roster" : "Upload the roster"}</summary>
          <div className="mt-4">
            <GolfCsvForm kind="roster" tournamentId={tournament.id} placeholder={templates.roster} exampleHref={example("roster")} />
          </div>
        </details>
      </section>

      <section id="draw" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">2. Day 1 draw ({tournament.golfGroups.length} groups)</h2>
          <p className="mt-1 text-sm text-muted">
            One row per player: <code>date</code> (YYYY-MM-DD), <code>flight</code>, <code>group</code> (its number
            for the day), <code>tee_time</code> (HH:MM), <code>school</code>, <code>seed</code>, and optional{" "}
            <code>marshal</code> and <code>course</code> (once per group is enough). Uploading replaces the whole
            draw; scores already entered are kept. Marshals only show here, not on the public site.
          </p>
          <p className="mt-1 text-sm text-muted">
            The{" "}
            <a href={example("draw")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            {tournament.golfGroups.length
              ? "is the current draw, ready to edit and re-upload."
              : "is a complete draw for the roster: groups of four from four schools, tee times 10 minutes apart from 8:30. Change the times and groups to match the day. The name column is only there to help - it's ignored."}
          </p>
        </div>
        {ungrouped.length > 0 && tournament.golfGroups.length > 0 && (
          <p className="text-sm text-danger">
            Not in a group yet: {ungrouped.map((p) => `${p.name} (${label(p.school)} ${p.seed})`).join(", ")}.
          </p>
        )}
        <details className="card p-4" open={players.length > 0 && tournament.golfGroups.length === 0}>
          <summary className="cursor-pointer font-semibold text-primary">
            {tournament.golfGroups.length ? "Upload a new draw" : "Upload the draw"}
          </summary>
          <div className="mt-4">
            <GolfCsvForm kind="draw" tournamentId={tournament.id} placeholder={templates.draw} exampleHref={example("draw")} />
          </div>
        </details>
      </section>

      <section id="scores" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">
            3. Scores ({scored} of {players.length})
          </h2>
          <p className="mt-1 text-sm text-muted">
            Points per player, higher is better. Enter them group by group below, or upload a CSV with{" "}
            <code>school</code>, <code>seed</code> and <code>points</code> (a blank points cell clears that score).
          </p>
          <p className="mt-1 text-sm text-muted">
            The{" "}
            <a href={example("scores")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            lists every player on the roster with the points entered so far - fill in the blanks
            and upload it.
          </p>
        </div>
        {tournament.golfGroups.length === 0 ? (
          <p className="text-sm text-muted">Groups appear here once the draw is uploaded.</p>
        ) : (
          GOLF_FLIGHTS.map((flight) => {
            const groups = tournament.golfGroups.filter((g) => g.flight === flight);
            if (groups.length === 0) return null;
            return (
              <div key={flight}>
                <h3 className="mb-2 text-sm uppercase tracking-wide text-muted">Flight {flight}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {groups.map((g) => (
                    <div key={g.id} id={`group-${g.id}`} className="card scroll-mt-20 p-3">
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          Group {g.number} · {format(g.teeTime, "h:mm a")}
                        </span>
                        {g.marshal && <span className="text-xs text-muted">Marshal: {g.marshal}</span>}
                      </div>
                      <GolfGroupScoresForm
                        groupId={g.id}
                        players={g.players.map((p) => ({ id: p.id, name: p.name, schoolLabel: label(p.school), points: p.points }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-primary">Upload scores (CSV)</summary>
          <div className="mt-4">
            <GolfCsvForm kind="scores" tournamentId={tournament.id} placeholder={templates.scores} exampleHref={example("scores")} />
          </div>
        </details>
      </section>

      <section id="team-draw" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">
            4. Team draw ({matches.length} matches, {rounds.length} rounds)
          </h2>
          <p className="mt-1 text-sm text-muted">
            One row per pairs match: <code>round</code>, <code>date</code>, <code>time</code>, <code>home</code>,{" "}
            <code>away</code>, <code>flight</code>, and optional <code>start_hole</code>, <code>marshal</code> and{" "}
            <code>course</code>. The three rows of a round with the same two schools make one school match. Pairs
            come from the roster (seeds 1&amp;2, 3&amp;4, 5&amp;6), so they aren&apos;t typed in. Uploading replaces
            the draw; results for pairs matches still in the file are kept.
          </p>
          <p className="mt-1 text-sm text-muted">
            The{" "}
            <a href={example("team-draw")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            {matches.length
              ? "is the current team draw, ready to edit and re-upload."
              : "is a full round robin (seeded in order once Day 1 is final), two rounds a day from the day after Day 1. Adjust the dates, times and holes to the real schedule. home_pair and away_pair are only there to check against - they're ignored."}
          </p>
        </div>
        <details className="card p-4" open={matches.length === 0 && players.length > 0}>
          <summary className="cursor-pointer font-semibold text-primary">{matches.length ? "Upload a new team draw" : "Upload the team draw"}</summary>
          <div className="mt-4">
            <GolfCsvForm kind="teamDraw" tournamentId={tournament.id} placeholder={templates.teamDraw} exampleHref={example("team-draw")} />
          </div>
        </details>
      </section>

      <section id="team-results" className="scroll-mt-20 space-y-4">
        <div>
          <h2 className="text-xl">
            5. Team results ({pairsIn} of {pairsTotal} pairs matches)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pick each pairs match&apos;s winner, or Halved, and its margin (&quot;3 up&quot;, &quot;2&amp;1&quot;).
            Or upload a CSV with <code>round</code>, <code>home</code>, <code>away</code>, <code>flight</code>,{" "}
            <code>winner</code> (either school, or &quot;halved&quot;) and optional <code>margin</code>; a blank
            winner clears that result.
          </p>
          <p className="mt-1 text-sm text-muted">
            The{" "}
            <a href={example("team-results")} download className="font-semibold text-primary hover:underline">
              example CSV
            </a>{" "}
            {matches.length
              ? "lists every pairs match in the draw with the results so far - fill in the winner and margin and upload it."
              : "shows every kind of result (a winning school with its margin, and halved) for a sample draw."}
          </p>
        </div>
        {matches.length === 0 ? (
          <p className="text-sm text-muted">Matches appear here once the team draw is uploaded.</p>
        ) : (
          rounds.map((round) => {
            const own = matches.filter((m) => m.round === round);
            return (
              <div key={round}>
                <h3 className="mb-2 text-sm uppercase tracking-wide text-muted">
                  Round {round} · {format(own[0].startTime, "EEE d MMM · h:mm a")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {own.map((m) => {
                    const score = matchScore(m.pairs);
                    return (
                      <div key={m.id} id={`match-${m.id}`} className="card scroll-mt-20 p-3">
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold">
                            {label(m.homeSchool)} vs {label(m.awaySchool)}
                          </span>
                          {score.decided > 0 && (
                            <span className="text-sm font-extrabold tabular-nums">
                              {formatGolfPoints(score.home)}–{formatGolfPoints(score.away)}
                            </span>
                          )}
                        </div>
                        <GolfMatchResultsForm
                          matchId={m.id}
                          homeLabel={label(m.homeSchool)}
                          awayLabel={label(m.awaySchool)}
                          pairs={m.pairs.map((p) => ({
                            id: p.id,
                            flight: p.flight,
                            startHole: p.startHole,
                            homePair: pairName(players, m.homeSchoolId, p.flight),
                            awayPair: pairName(players, m.awaySchoolId, p.flight),
                            winner: p.winner,
                            margin: p.margin,
                          }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-primary">Upload team results (CSV)</summary>
          <div className="mt-4">
            <GolfCsvForm kind="teamResults" tournamentId={tournament.id} placeholder={templates.teamResults} exampleHref={example("team-results")} />
          </div>
        </details>
      </section>
    </div>
  );
}
