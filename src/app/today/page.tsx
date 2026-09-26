import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_ORDER } from "@/lib/eventOrder";
import { EventRows } from "@/components/EventRows";
import { SportIcon } from "@/components/icons/SportIcon";
import { formatGolfPoints, matchScore } from "@/lib/golf";
import { sortDivisions } from "@/lib/academicGames";
import { dayBounds, formatDay, formatDayWithYear, formatShortDay, isDayKey, leagueToday } from "@/lib/dates";
import { LEAGUE_ZONES, makeClock, tournamentZone, zoneName, type Clock } from "@/lib/timeZones";
import { getTimeView } from "@/lib/timeView";
import { TimeZoneSwitch } from "@/components/TimeZoneSwitch";

export const dynamic = "force-dynamic";

export const metadata = { title: "Today" };

// Just what's needed to know each tournament's time zone.
const HOST_ZONE = { select: { timeZone: true } } as const;

// Every sport's games on one day, on one page - today by default, any
// other day with ?date=yyyy-MM-dd - grouped by tournament. Team games and
// sessions come from the schedule; golf and the Academic Bowl, which keep
// their own tables, are summarised with a link to their full schedules.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const today = leagueToday();
  const day = isDayKey(date) ? date : today;
  const bounds = dayBounds(day);
  const on = { gte: bounds.gte, lt: bounds.lt };

  const [events, golfGroups, golfMatches, bowlGames, previous, next] = await Promise.all([
    prisma.event.findMany({
      where: { date: on },
      orderBy: SCHEDULE_ORDER,
      include: {
        tournament: { include: { activity: { include: { fields: { orderBy: { order: "asc" } } } }, hostSchool: HOST_ZONE } },
        participants: { include: { school: true } },
        results: true,
        sets: { orderBy: { setNumber: "asc" } },
        fieldValues: true,
        division: true,
        homeSourceEvent: { select: { externalId: true } },
        awaySourceEvent: { select: { externalId: true } },
      },
    }),
    prisma.golfGroup.findMany({ where: { teeTime: on }, orderBy: { teeTime: "asc" }, include: { tournament: { include: { activity: true, hostSchool: HOST_ZONE } } } }),
    prisma.golfTeamMatch.findMany({
      where: { startTime: on },
      orderBy: [{ startTime: "asc" }, { round: "asc" }],
      include: { homeSchool: true, awaySchool: true, pairs: true, tournament: { include: { activity: true, hostSchool: HOST_ZONE } } },
    }),
    prisma.bowlGame.findMany({
      where: { startTime: on },
      orderBy: { startTime: "asc" },
      include: { division: true, tournament: { include: { activity: true, hostSchool: HOST_ZONE } } },
    }),
    nearestDay(bounds.gte, "before"),
    nearestDay(bounds.lt, "after"),
  ]);
  // Each tournament's times in the zone this visitor chose, or its own.
  const view = await getTimeView();
  const clockOf = (tournament: Parameters<typeof tournamentZone>[0]) => makeClock(tournamentZone(tournament), view);

  // One section per tournament, in the order their day starts.
  type Section = {
    key: string;
    start: Date;
    tournament: { slug: string; name: string; activity: { name: string; sport: string } };
    clock: Clock;
    body: React.ReactNode;
  };
  const sections: Section[] = [];
  const byTournament = new Map<string, typeof events>();
  for (const e of events) byTournament.set(e.tournamentId, [...(byTournament.get(e.tournamentId) ?? []), e]);
  for (const own of byTournament.values()) {
    const { tournament } = own[0];
    const clock = clockOf(tournament);
    sections.push({
      key: `events-${tournament.id}`,
      start: own[0].date,
      tournament,
      clock,
      body: (
        <EventRows
          events={own}
          customFields={tournament.activity.fields}
          tournamentSlug={tournament.slug}
          scoringType={tournament.activity.scoringType}
          usesSetScores={tournament.activity.usesSetScores}
          showDivisionTag={own.some((e) => e.divisionId)}
          showWatch
          clock={clock}
        />
      ),
    });
  }

  for (const tournamentId of new Set([...golfGroups.map((g) => g.tournamentId), ...golfMatches.map((m) => m.tournamentId)])) {
    const groups = golfGroups.filter((g) => g.tournamentId === tournamentId);
    const matches = golfMatches.filter((m) => m.tournamentId === tournamentId);
    const tournament = (groups[0] ?? matches[0]).tournament;
    const clock = clockOf(tournament);
    sections.push({
      key: `golf-${tournamentId}`,
      start: groups[0]?.teeTime ?? matches[0].startTime,
      tournament,
      clock,
      body: (
        <ul className="divide-y divide-divider border-y border-divider text-sm">
          {groups.length > 0 && (
            <li className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span>
                <span className="font-bold">Individual Championship</span> · {groups.length} groups, first tee{" "}
                {clock.format(groups[0].teeTime, "h:mm a")}
              </span>
              <Link href={`/seasons/${tournament.slug}/schedule`} className="font-semibold text-primary hover:underline">
                Tee times →
              </Link>
            </li>
          )}
          {matches.map((m) => {
            const score = matchScore(m.pairs);
            return (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span>
                  <span className="font-bold">
                    {m.homeSchool.code || m.homeSchool.name} v {m.awaySchool.code || m.awaySchool.name}
                  </span>
                  {score.decided > 0 && (
                    <span className="ml-2 font-extrabold tabular-nums">
                      {formatGolfPoints(score.home)}–{formatGolfPoints(score.away)}
                    </span>
                  )}
                  <span className="text-muted">
                    {" "}
                    · Team match play, round {m.round} · {clock.format(m.startTime, "h:mm a")}
                  </span>
                </span>
                <Link href={`/seasons/${tournament.slug}/schedule?view=team`} className="font-semibold text-primary hover:underline">
                  Match →
                </Link>
              </li>
            );
          })}
        </ul>
      ),
    });
  }

  for (const tournamentId of new Set(bowlGames.map((g) => g.tournamentId))) {
    const own = bowlGames.filter((g) => g.tournamentId === tournamentId);
    const tournament = own[0].tournament;
    const clock = clockOf(tournament);
    const divisions = sortDivisions([...new Map(own.map((g) => [g.divisionId, g.division])).values()]);
    sections.push({
      key: `bowl-${tournamentId}`,
      start: own[0].startTime,
      tournament,
      clock,
      body: (
        <ul className="divide-y divide-divider border-y border-divider text-sm">
          {divisions.map((division) => {
            const games = own.filter((g) => g.divisionId === division.id);
            const rounds = [...new Set(games.filter((g) => g.stage === "ROUND_ROBIN").map((g) => g.number))];
            const finals = games.some((g) => g.stage !== "ROUND_ROBIN");
            const what = [
              rounds.length > 0 && (rounds.length === 1 ? `Round ${rounds[0]}` : `Rounds ${Math.min(...rounds)}–${Math.max(...rounds)}`),
              finals && "Finals",
            ]
              .filter(Boolean)
              .join(" and ");
            return (
              <li key={division.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span>
                  <span className="font-bold">Academic Bowl · {division.name}</span> · {what} · from {clock.format(games[0].startTime, "h:mm a")}
                </span>
                <Link
                  href={`/seasons/${tournament.slug}/${division.slug}/schedule?view=bowl`}
                  className="font-semibold text-primary hover:underline"
                >
                  Games →
                </Link>
              </li>
            );
          })}
        </ul>
      ),
    });
  }
  // In the order their day actually starts, across time zones: each start is
  // its own tournament's local time.
  const startsAt = (section: Section) => section.start.getTime() - LEAGUE_ZONES[section.clock.hostZone].offsetMinutes * 60_000;
  sections.sort((a, b) => startsAt(a) - startsAt(b));

  const isToday = day === today;
  const dayDate = bounds.gte;
  return (
    <div className="page-wrap py-8">
      <p className="eyebrow text-primary-dark">{isToday ? formatDayWithYear(dayDate) : "Games on"}</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">{isToday ? "Today" : formatDay(dayDate)}</h1>

      <nav aria-label="Other days" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {previous && (
          <Link href={`/today?date=${previous}`} className="font-semibold text-primary hover:underline">
            ← {formatShortDay(new Date(`${previous}T00:00:00`))}
          </Link>
        )}
        {!isToday && (
          <Link href="/today" className="font-semibold text-primary hover:underline">
            Today
          </Link>
        )}
        {next && (
          <Link href={`/today?date=${next}`} className="font-semibold text-primary hover:underline">
            {formatShortDay(new Date(`${next}T00:00:00`))} →
          </Link>
        )}
      </nav>
      <div className="mt-4">
        <TimeZoneSwitch view={view} />
      </div>

      {sections.length === 0 ? (
        <div className="mt-8 border-y border-divider py-8">
          <p className="text-lg">{isToday ? "Nothing on today." : "Nothing on this day."}</p>
          {next && (
            <p className="mt-2 text-muted">
              Next games:{" "}
              <Link href={`/today?date=${next}`} className="font-semibold text-primary hover:underline">
                {formatDayWithYear(new Date(`${next}T00:00:00`))} →
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {sections.map((s) => (
            <section key={s.key}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-xl">
                  <SportIcon sport={s.tournament.activity.sport} size={20} />
                  {s.tournament.activity.name}
                </h2>
                <span className="text-sm">
                  <span className="text-muted">{zoneName(s.clock.zone)} · </span>
                  <Link href={`/seasons/${s.tournament.slug}`} className="font-semibold text-primary hover:underline">
                    {s.tournament.name} →
                  </Link>
                </span>
              </div>
              {s.body}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// The nearest day before `edge` (or on/after it) with anything on - a
// game, a session, a golf group or match, or an Academic Bowl game - as
// yyyy-MM-dd.
async function nearestDay(edge: Date, direction: "before" | "after"): Promise<string | null> {
  const where = direction === "before" ? { lt: edge } : { gte: edge };
  const sort = direction === "before" ? ("desc" as const) : ("asc" as const);
  const found = await Promise.all([
    prisma.event.findFirst({ where: { date: where, status: { not: "CANCELLED" } }, orderBy: { date: sort }, select: { date: true } }),
    prisma.golfGroup.findFirst({ where: { teeTime: where }, orderBy: { teeTime: sort }, select: { teeTime: true } }),
    prisma.golfTeamMatch.findFirst({ where: { startTime: where }, orderBy: { startTime: sort }, select: { startTime: true } }),
    prisma.bowlGame.findFirst({ where: { startTime: where }, orderBy: { startTime: sort }, select: { startTime: true } }),
  ]);
  const dates = [found[0]?.date, found[1]?.teeTime, found[2]?.startTime, found[3]?.startTime].filter((d): d is Date => !!d);
  if (dates.length === 0) return null;
  const pick = direction === "before" ? Math.max(...dates.map((d) => d.getTime())) : Math.min(...dates.map((d) => d.getTime()));
  return format(new Date(pick), "yyyy-MM-dd");
}
