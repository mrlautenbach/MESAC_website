import { prisma } from "@/lib/prisma";
import { format, startOfDay } from "date-fns";
import { ScheduleView } from "@/components/ScheduleView";

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
      season: { include: { tournament: true } },
      division: true,
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
      const [a, b] = event.participants;
      const resultA = a && event.results.find((r) => r.schoolId === a.schoolId);
      const resultB = b && event.results.find((r) => r.schoolId === b.schoolId);
      const bothScored = resultA?.score != null && resultB?.score != null;
      return {
        id: event.id,
        time: format(event.date, "HH:mm"),
        location: event.location,
        names:
          event.participants.length === 2
            ? null
            : event.participants.map((p) => p.school.name).join(" vs "),
        home: a?.school.name ?? null,
        away: b?.school.name ?? null,
        score: bothScored ? `${resultA!.score}–${resultB!.score}` : null,
        status: event.status,
        tournamentName: event.season.tournament.name,
        divisionName: event.division?.name ?? null,
        href: `/seasons/${event.season.slug}/events/${event.slug}`,
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
