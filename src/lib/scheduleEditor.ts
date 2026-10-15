import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_ORDER } from "@/lib/eventOrder";
import { scheduleSide } from "@/lib/scheduleExamples";
import { sortDivisions } from "@/lib/academicGames";
import type { GameEditorRow } from "@/components/GameScheduleEditor";
import type { MeetEditorRow } from "@/components/MeetProgramEditor";

// What the two schedule editors start from: the saved schedule as rows of
// cells named after the CSV columns, in the same formats the downloadable
// CSV uses - so saving a row unchanged writes back exactly what was there.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "WINNER(G3)" as the editor shows it: "Winner of G3", which saves the same.
const readableSide = (name: string) =>
  name.replace(/^(WINNER|LOSER)\((.+)\)$/, (_, outcome: string, id: string) => `${outcome === "WINNER" ? "Winner" : "Loser"} of ${id}`);

export async function loadGameEditor(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: { include: { fields: { orderBy: { order: "asc" } } } },
      divisions: true,
      events: {
        orderBy: SCHEDULE_ORDER,
        include: {
          division: true,
          participants: { include: { school: true } },
          results: true,
          fieldValues: true,
          homeSourceEvent: { select: { externalId: true } },
          awaySourceEvent: { select: { externalId: true } },
          _count: { select: { photos: true, documents: true, sets: true } },
        },
      },
    },
  });
  if (!tournament) return null;
  const { activity, events } = tournament;
  if (activity.usesMeetResults || activity.usesGolfFormat || activity.usesAcademicFormat) return null;

  const rows: GameEditorRow[] = events.map((e) => {
    const home = scheduleSide(e, true);
    const away = scheduleSide(e, false);
    const scored = e.results.some((r) => r.score !== null || r.outcome !== null);
    return {
      eventId: e.id,
      values: {
        game_id: e.externalId ?? "",
        gender: e.division?.name ?? "",
        home: readableSide(home.name),
        home_score: home.score?.toString() ?? "",
        away: readableSide(away.name),
        away_score: away.score?.toString() ?? "",
        date: format(e.date, "yyyy-MM-dd"),
        time: format(e.date, "HH:mm"),
        court: e.location ?? "",
        status: e.status,
        streaming_link: e.streamUrl ?? "",
        order: e.order?.toString() ?? "",
        title: e.title ?? "",
        ...Object.fromEntries(activity.fields.map((f) => [f.key, e.fieldValues.find((v) => v.fieldId === f.id)?.value ?? ""])),
      },
      locked: e.participants.length > 2 ? (e.title ?? e.participants.map((p) => p.school.code || p.school.name).join(", ")) : null,
      attached: [
        ...(scored ? ["result"] : []),
        ...(e._count.sets > 0 ? [plural(e._count.sets, "set score")] : []),
        ...(e._count.photos > 0 ? [plural(e._count.photos, "photo")] : []),
        ...(e._count.documents > 0 ? [plural(e._count.documents, "document")] : []),
      ],
    };
  });

  const schools = await prisma.school.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true } });
  const latest = Math.max(0, ...events.map((e) => e.updatedAt.getTime()));

  return {
    tournament,
    props: {
      tournamentId: tournament.id,
      version: `${events.length}-${latest}`,
      rows,
      divisions: sortDivisions(tournament.divisions).map((d) => d.name),
      scored: activity.scoringType !== "NONE",
      fields: activity.fields.map((f) => ({ key: f.key, label: f.label })),
      showOrder: events.some((e) => e.order !== null),
      showTitle: events.some((e) => e.title),
      schools: schools.map((s) => s.code || s.name),
      defaultDate: format(tournament.startDate, "yyyy-MM-dd"),
    },
  };
}

export async function loadMeetEditor(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: { orderBy: [{ date: "asc" }, { title: "asc" }], include: { _count: { select: { programEntries: true } } } },
      programEntries: { include: { event: { select: { id: true, title: true } }, division: true } },
    },
  });
  if (!tournament || !tournament.activity.usesMeetResults) return null;

  // Session by session, then the meet's running order within each.
  const sessionIndex = new Map(tournament.events.map((e, i) => [e.id, i]));
  const entries = [...tournament.programEntries].sort(
    (a, b) =>
      sessionIndex.get(a.eventId)! - sessionIndex.get(b.eventId)! ||
      a.eventNumber - b.eventNumber ||
      (a.round === b.round ? 0 : a.round === "PRELIM" ? -1 : 1)
  );

  const rows: MeetEditorRow[] = entries.map((p) => ({
    date: format(p.scheduledTime, "yyyy-MM-dd"),
    session: p.event.title ?? "",
    event_number: String(p.eventNumber),
    round: p.round.toLowerCase(),
    event_name: p.eventName,
    gender: p.gender === "GIRLS" ? "Girls" : p.gender === "BOYS" ? "Boys" : "",
    division: p.division?.name ?? "",
    location: p.location ?? "",
    status: p.status,
    live_stream: p.liveStreamUrl ?? "",
    time: format(p.scheduledTime, "HH:mm"),
  }));
  const latest = Math.max(0, ...tournament.programEntries.map((p) => p.createdAt.getTime()));

  return {
    tournament,
    props: {
      tournamentId: tournament.id,
      version: `${entries.length}-${latest}`,
      rows,
      divisions: sortDivisions(tournament.divisions).map((d) => d.name),
      sessions: tournament.events
        .filter((e) => e.title)
        .map((e) => ({ name: e.title!, date: format(e.date, "yyyy-MM-dd") })),
      defaultDate: format(tournament.startDate, "yyyy-MM-dd"),
    },
  };
}
