import { prisma } from "@/lib/prisma";
import { LATEST_FIRST } from "@/lib/eventOrder";
import { formatGolfPoints, matchScore } from "@/lib/golf";

// The home page's latest results: finished two-school games, plus golf's
// finished team matches (a golf match is three pairs matches scored in
// halves, so it isn't an Event and has to be read from its own table).
// Both come out in one shape, home side first, newest first.
export type LatestResult = {
  key: string;
  date: Date;
  // e.g. "Girls Volleyball", "Golf · Round 2"
  label: string;
  sport: string;
  hostSchoolName: string | null;
  sides: { name: string; code: string | null; score: number | null; display: string }[];
};

export async function loadLatestResults(take: number): Promise<LatestResult[]> {
  const [events, golfMatches] = await Promise.all([
    // Site-wide, not scoped to isCurrent tournaments - isCurrent only picks
    // which edition an activity page defaults to, and can legitimately be
    // wrong or unset for a while, which would otherwise make this look
    // empty even with real completed games on the schedule.
    prisma.event.findMany({
      // A meet-style session (no home/away pair) doesn't fit this score
      // ticker - it has its own results display, not a two-team score.
      where: { status: "COMPLETED", participants: { some: {} } },
      orderBy: LATEST_FIRST,
      take,
      include: {
        participants: { include: { school: true } },
        results: true,
        division: { select: { name: true } },
        tournament: { include: { activity: true, hostSchool: true } },
      },
    }),
    // Only matches with every pairs match decided - a half-played one isn't
    // a result yet.
    prisma.golfTeamMatch.findMany({
      where: { pairs: { some: {}, none: { winner: null } } },
      orderBy: { startTime: "desc" },
      take,
      include: { homeSchool: true, awaySchool: true, pairs: true, tournament: { include: { activity: true, hostSchool: true } } },
    }),
  ]);

  const fromEvents: LatestResult[] = events.map((event) => ({
    key: event.id,
    date: event.date,
    label: `${event.division ? `${event.division.name} ` : ""}${event.tournament.activity.name}`,
    sport: event.tournament.activity.sport,
    hostSchoolName: event.tournament.hostSchool?.name ?? null,
    sides: [...event.participants]
      .sort((a, b) => Number(b.isHome) - Number(a.isHome))
      .map((p) => {
        const score = event.results.find((r) => r.schoolId === p.schoolId)?.score ?? null;
        return { name: p.school.name, code: p.school.code, score, display: score === null ? "–" : String(score) };
      }),
  }));

  const fromGolf: LatestResult[] = golfMatches.map((match) => {
    const score = matchScore(match.pairs);
    return {
      key: match.id,
      date: match.startTime,
      label: `${match.tournament.activity.name} · Round ${match.round}`,
      sport: match.tournament.activity.sport,
      hostSchoolName: match.tournament.hostSchool?.name ?? null,
      sides: [
        { name: match.homeSchool.name, code: match.homeSchool.code, score: score.home, display: formatGolfPoints(score.home) },
        { name: match.awaySchool.name, code: match.awaySchool.code, score: score.away, display: formatGolfPoints(score.away) },
      ],
    };
  });

  return [...fromEvents, ...fromGolf].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, take);
}
