import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SchoolBadge } from "@/components/SchoolBadge";
import { GOLF_FLIGHTS, flightLeaderboard, flightOf, seedingIsFinal, teamSeeding } from "@/lib/golf";

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

// The team match play arrives in part 2; until then its side of the switch
// says so rather than showing an empty table.
export function GolfTeamComingSoon() {
  return (
    <p className="text-sm text-muted">
      The team match play draw appears here once Day 1 is done and the schools are seeded.
    </p>
  );
}
