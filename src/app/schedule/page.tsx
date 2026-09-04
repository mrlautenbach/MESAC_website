import { prisma } from "@/lib/prisma";
import { format, startOfDay } from "date-fns";
import { ScheduleView } from "@/components/ScheduleView";
import { sideLabel } from "@/lib/eventDisplay";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const today = startOfDay(new Date());

  const events = await prisma.event.findMany({
    where: { date: { gte: today }, status: { not: "CANCELLED" } },
    orderBy: { date: "asc" },
    take: 60,
    include: {
      participants: { include: { school: true } },
      results: true,
      tournament: { include: { activity: true } },
      division: true,
      homeSourceEvent: { select: { externalId: true } },
      awaySourceEvent: { select: { externalId: true } },
    },
  });

  const dayMap = new Map<string, typeof events>();
  for (const event of events) {
    const key = format(event.date, "yyyy-MM-dd");
    const list = dayMap.get(key) ?? [];
    list.push(event);
    dayMap.set(key, list);
  }

  const days = Array.from(dayMap.entries()).map(([key, dayEvents]) => ({
    key,
    label: format(dayEvents[0].date, "EEE d MMM"),
    fixtures: dayEvents.map((event) => {
      const home = event.participants.find((p) => p.isHome) ?? null;
      const away = event.participants.find((p) => !p.isHome) ?? null;
      const resultHome = home && event.results.find((r) => r.schoolId === home.schoolId);
      const resultAway = away && event.results.find((r) => r.schoolId === away.schoolId);
      const bothScored = resultHome?.score != null && resultAway?.score != null;
      const isDual = event.participants.length <= 2;
      return {
        id: event.id,
        time: format(event.date, "HH:mm"),
        location: event.location,
        names: isDual ? null : event.participants.map((p) => p.school.name).join(" vs "),
        home: isDual ? sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId) : null,
        away: isDual ? sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId) : null,
        homeColor: home?.school.themeColor ?? null,
        homeSecondaryColor: home?.school.themeColorSecondary ?? null,
        awayColor: away?.school.themeColor ?? null,
        awaySecondaryColor: away?.school.themeColorSecondary ?? null,
        score: bothScored ? `${resultHome!.score}–${resultAway!.score}` : null,
        status: event.status,
        streamUrl: event.streamUrl,
        tournamentName: event.tournament.activity.name,
        divisionName: event.division?.name ?? null,
        href: `/seasons/${event.tournament.slug}/events/${event.slug}`,
      };
    }),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h6 className="text-primary-dark">Live &amp; upcoming</h6>
      <h1 className="mt-2 text-4xl sm:text-5xl">Schedule</h1>
      <p className="mt-2 text-muted">All times local to each event&apos;s host school.</p>

      {days.length === 0 ? (
        <p className="mt-8 text-muted">No upcoming events scheduled.</p>
      ) : (
        <ScheduleView days={days} />
      )}
    </div>
  );
}
