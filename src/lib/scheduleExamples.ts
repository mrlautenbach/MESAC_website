import { addDays, differenceInCalendarDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { ordinal } from "@/lib/eventDisplay";
import { SCHEDULE_ORDER } from "@/lib/eventOrder";
import { sortDivisions } from "@/lib/academicGames";
import { roundRobin } from "@/lib/roundRobin";

// Downloadable examples for the two schedule uploads - the games schedule
// (team sports) and a meet's schedule & program. Like every example on the
// site, each is a complete file that uploads as-is: the tournament's
// schedule as it stands once there is one (so a change is "download, edit,
// re-upload"), otherwise a sample built from its own dates, schools and
// divisions.

const label = (s: { code: string | null; name: string }) => s.code || s.name;

// ── Games (team sports) ────────────────────────────────────────────────

export async function buildGameScheduleExample(tournamentId: string): Promise<{ filename: string; csv: string } | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: { include: { fields: { orderBy: { order: "asc" } } } },
      divisions: { orderBy: { name: "asc" } },
      schools: { where: { participating: true }, include: { school: true } },
      events: {
        orderBy: SCHEDULE_ORDER,
        include: {
          division: true,
          participants: { include: { school: true } },
          results: true,
          fieldValues: true,
          homeSourceEvent: { select: { externalId: true } },
          awaySourceEvent: { select: { externalId: true } },
        },
      },
    },
  });
  if (!tournament) return null;
  const { activity } = tournament;
  if (activity.usesMeetResults || activity.usesGolfFormat || activity.usesAcademicFormat) return null;

  const filename = `${tournament.slug}-schedule.csv`;
  const hasDivisions = tournament.divisions.length > 0;
  const scored = activity.scoringType !== "NONE";
  const fields = activity.fields;
  const header = [
    "game_id",
    ...(hasDivisions ? ["gender"] : []),
    "home",
    "home_score",
    "away",
    "away_score",
    "date",
    "time",
    "court",
    "streaming_link",
    "status",
    ...fields.map((f) => f.key),
  ];

  // Only games with a game_id: a re-upload matches games by it, so one
  // without (added one at a time) would come back as a duplicate. They're
  // left out, and stay as they are.
  const withIds = tournament.events.filter((e) => e.externalId);
  if (withIds.length > 0) {
    // A side not yet decided goes back out the way it came in: WINNER(G3),
    // a standing ("2nd"), or TBD with its label.
    type E = (typeof withIds)[number];
    const side = (e: E, isHome: boolean) => {
      const p = e.participants.find((x) => x.isHome === isHome);
      if (p) return { name: label(p.school), score: e.results.find((r) => r.schoolId === p.schoolId)?.score ?? null };
      const outcome = isHome ? e.homeSourceOutcome : e.awaySourceOutcome;
      const source = isHome ? e.homeSourceEvent : e.awaySourceEvent;
      const standing = isHome ? e.homeSourceStanding : e.awaySourceStanding;
      const text = isHome ? e.homeSourceLabel : e.awaySourceLabel;
      const name =
        outcome && source?.externalId
          ? `${outcome}(${source.externalId})`
          : standing
            ? ordinal(standing)
            : text
              ? `TBD(${text})`
              : "TBD";
      return { name, score: null };
    };
    const rows = withIds.map((e) => {
      const home = side(e, true);
      const away = side(e, false);
      return [
        e.externalId,
        ...(hasDivisions ? [e.division?.name ?? ""] : []),
        home.name,
        scored ? home.score : null,
        away.name,
        scored ? away.score : null,
        format(e.date, "yyyy-MM-dd"),
        format(e.date, "HH:mm"),
        e.location,
        e.streamUrl,
        e.status,
        ...fields.map((f) => e.fieldValues.find((v) => v.fieldId === f.id)?.value ?? ""),
      ];
    });
    return { filename, csv: toCsv(header, rows) };
  }

  // A round robin between the tournament's schools (or the league's, before
  // any are entered) in each division, on two courts, games every 75
  // minutes from 9:00 spread across the tournament's days, then a final
  // between the top two at the end.
  const roster = tournament.schools.map((s) => label(s.school));
  const schools = roster.length >= 2
    ? roster.sort((a, b) => a.localeCompare(b))
    : (await prisma.school.findMany({ where: { isLeagueMember: true }, orderBy: { name: "asc" } })).map(label);
  const tracks: (string | null)[] = hasDivisions ? sortDivisions(tournament.divisions).map((d) => d.name) : [null];
  const games: { track: string | null; home: string; away: string }[] = [];
  for (const [a, b] of roundRobin(schools).flat()) for (const track of tracks) games.push({ track, home: a, away: b });

  const courts = ["Court 1", "Court 2"];
  const days = Math.max(1, differenceInCalendarDays(tournament.endDate, tournament.startDate) + 1);
  const slots = Math.ceil(games.length / courts.length) + 1; // the finals take the last one
  const slotsPerDay = Math.ceil(slots / days);
  const when = (slot: number) => {
    const day = addDays(tournament.startDate, Math.floor(slot / slotsPerDay));
    const minutes = 9 * 60 + (slot % slotsPerDay) * 75;
    return { date: format(day, "yyyy-MM-dd"), time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` };
  };
  const blank = fields.map(() => "");
  const rows: (string | number | null)[][] = games.map((g, i) => {
    const { date, time } = when(Math.floor(i / courts.length));
    return [`G${i + 1}`, ...(hasDivisions ? [g.track] : []), g.home, null, g.away, null, date, time, courts[i % courts.length], null, "SCHEDULED", ...blank];
  });
  const finalSlot = slots - 1;
  tracks.forEach((track, t) => {
    const { date, time } = when(finalSlot);
    rows.push([`F${t + 1}`, ...(hasDivisions ? [track] : []), "1st", null, "2nd", null, date, time, courts[t % courts.length], null, "SCHEDULED", ...blank]);
  });
  return { filename, csv: toCsv(header, rows) };
}

// ── Meets (swimming, track & field) ────────────────────────────────────

const SAMPLE_EVENTS: Record<string, { name: string; relay: boolean }[]> = {
  Swimming: [
    { name: "50m Freestyle", relay: false },
    { name: "100m Backstroke", relay: false },
    { name: "200m Individual Medley", relay: false },
    { name: "4x50m Medley Relay", relay: true },
  ],
  "Track & Field": [
    { name: "100m", relay: false },
    { name: "400m", relay: false },
    { name: "Long Jump", relay: false },
    { name: "4x100m Relay", relay: true },
  ],
};

export async function buildMeetScheduleExample(tournamentId: string): Promise<{ filename: string; csv: string } | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: { orderBy: { name: "asc" } },
      programEntries: {
        orderBy: [{ scheduledTime: "asc" }, { eventNumber: "asc" }],
        include: { event: { select: { title: true } }, division: true },
      },
    },
  });
  if (!tournament || !tournament.activity.usesMeetResults) return null;
  const filename = `${tournament.slug}-meet-schedule.csv`;
  const hasDivisions = tournament.divisions.length > 0;
  const header = [
    "date",
    "session",
    "event_number",
    "round",
    "event_name",
    "gender",
    ...(hasDivisions ? ["division"] : []),
    "location",
    "status",
    "live_stream",
    "time",
  ];

  if (tournament.programEntries.length > 0) {
    const rows = tournament.programEntries.map((p) => [
      format(p.scheduledTime, "yyyy-MM-dd"),
      p.event.title,
      p.eventNumber,
      p.round.toLowerCase(),
      p.eventName,
      p.gender === "GIRLS" ? "Girls" : p.gender === "BOYS" ? "Boys" : "",
      ...(hasDivisions ? [p.division?.name ?? ""] : []),
      p.location,
      p.status,
      p.liveStreamUrl,
      format(p.scheduledTime, "HH:mm"),
    ]);
    return { filename, csv: toCsv(header, rows) };
  }

  // Prelims in the morning, finals in the evening, on the first day: each
  // event for girls and boys (and each division), relays straight to a
  // final, one event number per race and round pair.
  const sport = tournament.activity.sport;
  const events = SAMPLE_EVENTS[sport] ?? SAMPLE_EVENTS.Swimming;
  const venue = sport === "Swimming" ? "Aquatics Centre" : "Stadium";
  const day = format(tournament.startDate, "yyyy-MM-dd");
  const tracks: (string | null)[] = hasDivisions ? sortDivisions(tournament.divisions).map((d) => d.name) : [null];
  const at = (start: number, k: number) => {
    const minutes = start * 60 + k * 10;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  const rows: (string | number)[][] = [];
  let number = 0;
  for (const event of events) {
    for (const track of tracks) {
      for (const gender of ["Girls", "Boys"]) {
        number++;
        const division = hasDivisions ? [track ?? ""] : [];
        if (!event.relay) {
          rows.push([day, "Day 1 Prelims", number, "prelim", event.name, gender, ...division, venue, "SCHEDULED", "", at(9, number - 1)]);
        }
        rows.push([day, "Day 1 Finals", number, "final", event.name, gender, ...division, venue, "SCHEDULED", "", at(17, number - 1)]);
      }
    }
  }
  return { filename, csv: toCsv(header, rows) };
}
