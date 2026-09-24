import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SchoolBadge } from "@/components/SchoolBadge";
import {
  GOLF_FLIGHTS,
  flightLeaderboard,
  flightOf,
  formatGolfPoints,
  matchScore,
  pairName,
  seedingIsFinal,
  teamSeeding,
  teamStandings,
} from "@/lib/golf";

// Golf's public Schedule and Results, Individual side: the Day 1 tee-time
// groups, then each flight's leaderboard and the team seeding they produce.

type School = { id: string; name: string; code: string | null; logoUrl: string | null; themeColor: string | null; themeColorSecondary: string | null };

const schoolLabel = (school: School) => school.code || school.name;

function SchoolCell({ school }: { school: School }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <SchoolBadge size={24} logoUrl={school.logoUrl} name={school.name} color={school.themeColor} secondaryColor={school.themeColorSecondary} />
      <span title={school.name}>{schoolLabel(school)}</span>
    </span>
  );
}

export async function GolfIndividualSchedule({ tournamentId }: { tournamentId: string }) {
  const groups = await prisma.golfGroup.findMany({
    where: { tournamentId },
    orderBy: [{ teeTime: "asc" }, { number: "asc" }],
    include: { players: { orderBy: { school: { name: "asc" } }, include: { school: true } } },
  });
  if (groups.length === 0) {
    return <p className="text-sm text-muted">The Day 1 tee times haven&apos;t been posted yet.</p>;
  }

  const days = [...new Set(groups.map((g) => format(g.teeTime, "EEEE d MMMM")))];
  const courses = [...new Set(groups.map((g) => g.course).filter(Boolean))];

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        <span className="font-semibold text-foreground">Individual Championship</span> · {days.join(" and ")}
        {courses.length > 0 && ` · ${courses.join(", ")}`}
      </p>
      {GOLF_FLIGHTS.map((flight) => {
        const own = groups.filter((g) => g.flight === flight);
        if (own.length === 0) return null;
        return (
          <section key={flight}>
            <h5 className="mb-2">Flight {flight}</h5>
            <ul className="divide-y divide-divider border-y border-divider">
              {own.map((g) => (
                <li key={g.id} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <div>
                    <div className="text-lg font-extrabold tabular-nums">{format(g.teeTime, "h:mm")}</div>
                    <div className="text-xs text-muted">Group {g.number}</div>
                  </div>
                  <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {g.players.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-muted">
                          <SchoolCell school={p.school} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export async function GolfIndividualResults({ tournamentId }: { tournamentId: string }) {
  const players = await prisma.golfPlayer.findMany({ where: { tournamentId }, include: { school: true } });
  if (players.length === 0) {
    return <p className="text-sm text-muted">Results appear here once the Day 1 scores are in.</p>;
  }
  const schools = [...new Map(players.map((p) => [p.schoolId, p.school])).values()];
  const seeding = teamSeeding(schools, players);
  const seedsFinal = seedingIsFinal(seeding);
  const anyScores = players.some((p) => p.points !== null);

  return (
    <div className="space-y-10">
      {!anyScores && <p className="text-sm text-muted">No Day 1 scores yet - leaderboards fill in as groups finish.</p>}

      <div className="grid gap-8 lg:grid-cols-3">
        {GOLF_FLIGHTS.map((flight) => {
          const own = players.filter((p) => flightOf(p.seed) === flight);
          if (own.length === 0) return null;
          const rows = flightLeaderboard(own);
          // "Champion" only once every player in the flight has a score -
          // until then whoever's top is just leading.
          const complete = own.every((p) => p.points !== null);
          return (
            <section key={flight}>
              <h5 className="mb-2">Flight {flight}</h5>
              <table className="mtable">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Player</th>
                    <th>School</th>
                    <th className="text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ player, place, tied }) => (
                    <tr key={player.id}>
                      <td className="font-extrabold tabular-nums text-primary-deep">
                        {place === null ? "–" : `${place}${tied ? "=" : ""}`}
                      </td>
                      <td>
                        <span className="font-semibold">{player.name}</span>
                        {place === 1 && (
                          <span className={`ml-1.5 tag ${complete ? "tag-accent" : "tag-outline"}`}>{complete ? "Champion" : "Leader"}</span>
                        )}
                      </td>
                      <td className="text-muted">
                        <SchoolCell school={player.school} />
                      </td>
                      <td className="text-right text-[17px] font-extrabold tabular-nums">{player.points ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      <section className="max-w-xl">
        <h5 className="mb-1">
          Team seeding {!seedsFinal && <span className="ml-1 tag tag-outline align-middle">Provisional</span>}
        </h5>
        <p className="mb-3 text-sm text-muted">
          Each school&apos;s six Day 1 scores added up. The highest total is the top seed for the team match play.
          {!seedsFinal && " The order is final once every player's score is in."}
        </p>
        <table className="mtable">
          <thead>
            <tr>
              <th style={{ width: 48 }}>Seed</th>
              <th>School</th>
              <th className="text-right">Total</th>
              <th className="text-right">Scores in</th>
            </tr>
          </thead>
          <tbody>
            {seeding.map((row) => (
              <tr key={row.school.id}>
                <td className={`text-[17px] font-extrabold tabular-nums ${seedsFinal ? "text-primary-deep" : "text-muted"}`}>{row.seed}</td>
                <td className="font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <SchoolBadge size={28} logoUrl={row.school.logoUrl} name={row.school.name} color={row.school.themeColor} secondaryColor={row.school.themeColorSecondary} />
                    <span className="sm:hidden">{schoolLabel(row.school)}</span>
                    <span className="hidden sm:inline">{row.school.name}</span>
                  </span>
                </td>
                <td className="text-right text-[17px] font-extrabold tabular-nums">{row.total}</td>
                <td className="text-right tabular-nums text-muted">
                  {row.scoresIn} of {row.players}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ── Team match play ────────────────────────────────────────────────────

async function loadTeamEvent(tournamentId: string) {
  const [matches, players] = await Promise.all([
    prisma.golfTeamMatch.findMany({
      where: { tournamentId },
      orderBy: [{ round: "asc" }, { startTime: "asc" }],
      include: { homeSchool: true, awaySchool: true, pairs: { orderBy: { flight: "asc" } } },
    }),
    prisma.golfPlayer.findMany({ where: { tournamentId }, include: { school: true } }),
  ]);
  // Seeds from Day 1, shown beside each school once they're final.
  const schools = [...new Map(players.map((p) => [p.schoolId, p.school])).values()];
  const seeding = teamSeeding(schools, players);
  const seedBySchool = seedingIsFinal(seeding) ? new Map(seeding.map((r) => [r.school.id, r.seed])) : new Map<string, number>();
  return { matches, players, seedBySchool };
}

type TeamEvent = Awaited<ReturnType<typeof loadTeamEvent>>;
type TeamMatch = TeamEvent["matches"][number];

function MatchSide({ school, seed, align }: { school: School; seed?: number; align: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <SchoolBadge size={28} logoUrl={school.logoUrl} name={school.name} color={school.themeColor} secondaryColor={school.themeColorSecondary} />
      <div className="min-w-0">
        <div className="font-extrabold leading-tight">
          <span className="sm:hidden">{schoolLabel(school)}</span>
          <span className="hidden sm:inline">{school.name}</span>
        </div>
        {seed && <div className="text-xs text-muted">Seed {seed}</div>}
      </div>
    </div>
  );
}

function MatchCard({ match, event }: { match: TeamMatch; event: TeamEvent }) {
  const score = matchScore(match.pairs);
  return (
    <article className="border border-divider">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-divider px-3 py-2.5">
        <MatchSide school={match.homeSchool} seed={event.seedBySchool.get(match.homeSchoolId)} align="left" />
        <div className="text-center">
          {score.decided > 0 ? (
            <div className="text-xl font-extrabold tabular-nums">
              {formatGolfPoints(score.home)}–{formatGolfPoints(score.away)}
            </div>
          ) : (
            <div className="text-sm font-semibold text-muted">vs</div>
          )}
          {score.decided > 0 && !score.complete && <div className="text-[11px] text-muted">In progress</div>}
        </div>
        <MatchSide school={match.awaySchool} seed={event.seedBySchool.get(match.awaySchoolId)} align="right" />
      </div>
      <ul className="divide-y divide-divider">
        {match.pairs.map((pair) => {
          const home = pairName(event.players, match.homeSchoolId, pair.flight);
          const away = pairName(event.players, match.awaySchoolId, pair.flight);
          const tone = (side: "HOME" | "AWAY") =>
            pair.winner === side ? "font-semibold" : pair.winner && pair.winner !== "HALVED" ? "text-muted" : "";
          const winnerSchool = pair.winner === "HOME" ? match.homeSchool : pair.winner === "AWAY" ? match.awaySchool : null;
          return (
            <li key={pair.id} className="grid gap-x-4 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)_7rem] sm:items-center">
              <div className="text-xs text-muted">
                Flight {pair.flight}
                {pair.startHole ? ` · Hole ${pair.startHole}` : ""}
              </div>
              <div>
                <div className={tone("HOME")}>{home}</div>
                <div className={tone("AWAY")}>
                  <span className="font-normal text-muted">vs</span> {away}
                </div>
              </div>
              <div className="text-xs font-semibold sm:text-right sm:text-sm">
                {pair.winner === "HALVED" ? (
                  "Halved"
                ) : winnerSchool ? (
                  <>
                    {schoolLabel(winnerSchool)} {pair.margin && <span className="font-normal text-muted">{pair.margin}</span>}
                  </>
                ) : (
                  <span className="font-normal text-muted">–</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function Rounds({ matches, event }: { matches: TeamMatch[]; event: TeamEvent }) {
  const rounds = [...new Set(matches.map((m) => m.round))];
  return (
    <div className="space-y-8">
      {rounds.map((round) => {
        const own = matches.filter((m) => m.round === round);
        const times = [...new Set(own.map((m) => m.startTime.getTime()))];
        const courses = [...new Set(own.map((m) => m.course).filter(Boolean))];
        return (
          <section key={round}>
            <h5 className="mb-1">Round {round}</h5>
            <p className="mb-3 text-sm text-muted">
              {format(own[0].startTime, "EEEE d MMMM")}
              {times.length === 1 && ` · ${format(own[0].startTime, "h:mm a")}`}
              {courses.length > 0 && ` · ${courses.join(", ")}`}
            </p>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {own.map((m) => (
                <MatchCard key={m.id} match={m} event={event} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export async function GolfTeamSchedule({ tournamentId }: { tournamentId: string }) {
  const event = await loadTeamEvent(tournamentId);
  if (event.matches.length === 0) {
    return <p className="text-sm text-muted">The team match play draw appears here once it&apos;s set.</p>;
  }
  const first = event.matches[0].startTime;
  const last = event.matches[event.matches.length - 1].startTime;
  const rounds = new Set(event.matches.map((m) => m.round)).size;
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        <span className="font-semibold text-foreground">Team Championship</span> · match play, {rounds} round
        {rounds === 1 ? "" : "s"} · {format(first, "d MMM")}
        {format(first, "yyyy-MM-dd") !== format(last, "yyyy-MM-dd") && ` – ${format(last, "d MMM")}`}. Each school match
        is three pairs matches, one per flight.
      </p>
      <Rounds matches={event.matches} event={event} />
    </div>
  );
}

export async function GolfTeamResults({
  tournamentId,
  scoring,
}: {
  tournamentId: string;
  scoring: { winPoints: number; drawPoints: number; lossPoints: number };
}) {
  const event = await loadTeamEvent(tournamentId);
  if (event.matches.length === 0) {
    return <p className="text-sm text-muted">Team results appear here once the match play is under way.</p>;
  }
  const schools = [
    ...new Map(event.matches.flatMap((m) => [[m.homeSchoolId, m.homeSchool] as const, [m.awaySchoolId, m.awaySchool] as const])).values(),
  ];
  const standings = teamStandings(schools, event.matches, scoring);
  const played = event.matches.filter((m) => matchScore(m.pairs).decided > 0);

  return (
    <div className="space-y-10">
      <section className="max-w-2xl">
        <h5 className="mb-3">Standings</h5>
        <table className="mtable">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>School</th>
              <th className="text-right">P</th>
              <th className="text-right">W</th>
              <th className="text-right">D</th>
              <th className="text-right">L</th>
              <th className="text-right" title="Pairs matches won - a halved one counts ½">
                Flight pts
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.school.id}>
                <td className="text-[17px] font-extrabold tabular-nums text-primary-deep">{row.place}</td>
                <td className="font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <SchoolBadge size={28} logoUrl={row.school.logoUrl} name={row.school.name} color={row.school.themeColor} secondaryColor={row.school.themeColorSecondary} />
                    <span className="sm:hidden">{schoolLabel(row.school)}</span>
                    <span className="hidden sm:inline">{row.school.name}</span>
                  </span>
                </td>
                <td className="text-right tabular-nums">{row.played}</td>
                <td className="text-right tabular-nums">{row.wins}</td>
                <td className="text-right tabular-nums">{row.draws}</td>
                <td className="text-right tabular-nums">{row.losses}</td>
                <td className="text-right text-[17px] font-extrabold tabular-nums">{formatGolfPoints(row.flightPoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Ranked by match wins and draws; schools level on those are split by flight points (a pairs match won is 1,
          halved is ½). A match counts once all three of its pairs matches are finished.
        </p>
      </section>

      {played.length === 0 ? (
        <p className="text-sm text-muted">No team results yet.</p>
      ) : (
        <Rounds matches={played} event={event} />
      )}
    </div>
  );
}
