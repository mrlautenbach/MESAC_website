import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";

// The downloadable example for a meet session's results CSV - a complete,
// valid file that uploads as-is:
// - once the session has results, it's those results, so a correction is
//   "download, fix, re-upload" (an import replaces the whole session);
// - otherwise it's sample placings for every race in the session's program,
//   one swimmer or athlete per league school, marked "Swimmer 1" etc.;
// - with no program yet, a few sample races.

const HEADER = ["event_number", "event_name", "round", "place", "name", "school", "mark", "seed", "prelim_time", "points", "record"];

// Common 8-place scoring; relays score double.
const POINTS = [9, 7, 6, 5, 4, 3, 2, 1];

const SAMPLE_RACES: Record<string, string[]> = {
  Swimming: ["200m Medley Relay", "100m Freestyle", "50m Backstroke", "100m Breaststroke"],
  "Track & Field": ["100m", "800m", "Long Jump", "4x100m Relay"],
};

type Race = { eventNumber: number | null; eventName: string; round: "PRELIM" | "FINAL" };

const isRelay = (name: string) => /relay/i.test(name);
const isField = (name: string) => /jump|vault|put|discus|javelin|hammer|throw/i.test(name);

// A race's total distance in metres: "4x100m Relay" -> 400, "100m Freestyle" -> 100.
function distanceOf(name: string): number {
  const legs = name.match(/(\d+)\s*x\s*(\d+)/i);
  if (legs) return Number(legs[1]) * Number(legs[2]);
  const single = name.match(/(\d+)\s*m?\b/i);
  return single ? Number(single[1]) : 100;
}

// A believable winning time in seconds, from seconds-per-100m for the
// stroke (swimming) or the distance (track).
function winningSeconds(name: string, sport: string): number {
  const distance = distanceOf(name);
  if (sport === "Swimming") {
    const pace = /medley relay/i.test(name)
      ? 58
      : /back/i.test(name)
        ? 66
        : /breast/i.test(name)
          ? 74
          : /fly|butterfly/i.test(name)
            ? 63
            : /medley|\bIM\b/i.test(name)
              ? 70
              : 57;
    return (distance / 100) * pace;
  }
  const pace = distance <= 100 ? 12.2 : distance <= 200 ? 12.8 : distance <= 400 ? 14.5 : distance <= 800 ? 17.5 : 19;
  return (distance / 100) * pace;
}

// 27.45, 1:02.31
function formatTime(seconds: number): string {
  const hundredths = Math.round(seconds * 100);
  const minutes = Math.floor(hundredths / 6000);
  const rest = ((hundredths % 6000) / 100).toFixed(2);
  return minutes > 0 ? `${minutes}:${rest.padStart(5, "0")}` : rest;
}

function winningMetres(name: string): number {
  if (/high/i.test(name)) return 1.75;
  if (/vault/i.test(name)) return 3.4;
  if (/triple/i.test(name)) return 12.1;
  if (/jump/i.test(name)) return 5.8;
  if (/put/i.test(name)) return 11.5;
  if (/discus/i.test(name)) return 34;
  if (/javelin/i.test(name)) return 42;
  return 30;
}

export async function buildMeetResultsExample(eventId: string): Promise<{ filename: string; csv: string } | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tournament: { include: { activity: true } },
      programEntries: { orderBy: [{ eventNumber: "asc" }, { round: "asc" }] },
      meetResults: { orderBy: { rowOrder: "asc" }, include: { school: true } },
    },
  });
  if (!event || !event.tournament.activity.usesMeetResults) return null;

  const filename = `${event.tournament.slug}-${event.slug}-results.csv`;
  const label = (s: { code: string | null; name: string }) => s.code || s.name;

  if (event.meetResults.length > 0) {
    // event_number picks the program entry each row belongs to, so rows
    // for two races sharing a name (e.g. Girls and Boys 100m Freestyle)
    // re-upload to the right one.
    const numberOf = (r: (typeof event.meetResults)[number]) =>
      event.programEntries.find(
        (p) => p.eventName === r.eventName && p.round === r.round && p.divisionId === r.divisionId && p.gender === r.gender
      )?.eventNumber ?? null;
    const rows = event.meetResults.map((r) => [
      numberOf(r),
      r.eventName,
      r.round.toLowerCase(),
      r.place,
      r.athleteName,
      label(r.school),
      r.mark,
      r.seedMark,
      r.prelimMark,
      r.points,
      r.recordNotation,
    ]);
    return { filename, csv: toCsv(HEADER, rows) };
  }

  const sport = event.tournament.activity.sport;
  const races: Race[] =
    event.programEntries.length > 0
      ? event.programEntries.map((p) => ({ eventNumber: p.eventNumber, eventName: p.eventName, round: p.round }))
      : (SAMPLE_RACES[sport] ?? SAMPLE_RACES.Swimming).map((eventName) => ({
          eventNumber: null,
          eventName,
          round: /prelim|heat/i.test(event.title ?? "") ? "PRELIM" : "FINAL",
        }));
  const schools = (await prisma.school.findMany({ where: { isLeagueMember: true } }))
    .map(label)
    .sort((a, b) => a.localeCompare(b));
  const person = sport === "Swimming" ? "Swimmer" : "Athlete";

  const rows = races.flatMap((race, r) => {
    // A different finishing order for each race, so the example isn't one
    // school winning everything.
    const order = schools.map((_, i) => schools[(i + r) % schools.length]);
    const relay = isRelay(race.eventName);
    const field = isField(race.eventName);
    const prelim = race.round === "PRELIM";
    return order.map((school, i) => {
      // Small, fixed hundredths so the marks look real but stay the same
      // every download.
      const jitter = ((r * 37 + i * 13) % 100) / 100;
      let mark: string;
      let context = "";
      if (field) {
        const metres = winningMetres(race.eventName) * (1 - i * 0.03) - jitter / 10;
        mark = `${metres.toFixed(2)}m`;
      } else {
        const seconds = winningSeconds(race.eventName, sport) * (1 + i * 0.015) + jitter;
        mark = formatTime(seconds);
        context = formatTime(seconds + 0.4 + jitter / 2);
      }
      return [
        race.eventNumber,
        race.eventName,
        race.round.toLowerCase(),
        i + 1,
        relay ? `${school} A` : `${school} ${person} ${r + 1}`,
        school,
        mark,
        prelim ? context : "",
        prelim ? "" : context,
        prelim ? "" : (POINTS[i] ?? 0) * (relay ? 2 : 1),
        r === 0 && i === 0 ? "MR" : "",
      ];
    });
  });
  return { filename, csv: toCsv(HEADER, rows) };
}
