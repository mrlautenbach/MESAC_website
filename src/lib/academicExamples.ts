import { addDays, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { RUN_BY_FIELD, sortDivisions } from "@/lib/academicGames";

// The downloadable example for the Academic Games schedule upload - a
// complete file that uploads as-is: the tournament's current timeline once
// there is one (so a change is "download, edit, re-upload"), otherwise the
// 2025 schedule's competitions moved onto this tournament's dates, with
// venues still to be filled in left blank.

const HEADER = ["date", "start", "end", "title", "team", "venue", "run_by"];

// [day (1 = the tournament's first day), start, end, title, team, venue, run_by]
type SampleRow = [number, string, string, string, "varsity" | "jv" | "", string, string];

const SAMPLE: SampleRow[] = [
  [1, "08:45", "09:15", "Mystery Challenge (Ice Breaker)", "", "", ""],
  [1, "09:25", "10:15", "Math Challenge", "varsity", "", "AS Dubai"],
  [1, "10:25", "12:50", "Academic Bowl Rounds 1-6 Plus Exhibition", "varsity", "Classrooms", ""],
  [1, "09:25", "11:50", "Academic Bowl Rounds 1-6 Plus Exhibition", "jv", "Classrooms", ""],
  [1, "12:00", "12:50", "Math Challenge", "jv", "", "AS Dubai"],
  [1, "13:45", "14:45", "Humanities Challenge", "varsity", "", ""],
  [1, "14:55", "17:20", "Academic Bowl Rounds 7-12", "varsity", "Classrooms", ""],
  [1, "13:45", "16:05", "Academic Bowl Rounds 7-12", "jv", "Classrooms", ""],
  [1, "16:15", "17:15", "Humanities Challenge", "jv", "", ""],
  [2, "08:45", "10:05", "Engineering Olympiad", "varsity", "", "AS Doha"],
  [2, "10:15", "12:40", "Academic Bowl Rounds 13-18", "varsity", "Classrooms", ""],
  [2, "08:45", "11:10", "Academic Bowl Rounds 13-18", "jv", "Classrooms", ""],
  [2, "11:20", "12:40", "Engineering Olympiad", "jv", "", "AS Doha"],
  [2, "13:30", "14:20", "Current Events Olympiad", "", "", ""],
  [2, "14:30", "16:55", "Academic Bowl Rounds 19-24", "varsity", "Classrooms", ""],
  [2, "14:30", "16:55", "Academic Bowl Rounds 19-24", "jv", "Classrooms", ""],
  [2, "17:05", "17:55", "Geography/Science Challenge", "", "", ""],
  [3, "09:30", "10:20", "Art and Music Olympiad", "", "MPH", "AES"],
  [3, "10:30", "10:50", "Academic Bowl Quarterfinals", "jv", "4 rooms", ""],
  [3, "11:00", "11:20", "Academic Bowl Quarterfinals", "varsity", "4 rooms", ""],
  [3, "11:40", "12:00", "Academic Bowl Semifinals", "jv", "", ""],
  [3, "12:10", "12:30", "Academic Bowl Semifinals", "varsity", "", ""],
  [3, "14:00", "14:20", "Academic Bowl Consolation Round", "jv", "Theater", ""],
  [3, "14:30", "14:50", "Academic Bowl Consolation Round", "varsity", "Theater", ""],
  [3, "15:00", "15:30", "Academic Bowl Final", "jv", "Theater", ""],
  [3, "15:40", "16:10", "Academic Bowl Final", "varsity", "Theater", ""],
];

export async function buildAcademicScheduleExample(tournamentId: string): Promise<{ filename: string; csv: string } | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: {
        orderBy: { date: "asc" },
        include: { fieldValues: { where: { field: { key: RUN_BY_FIELD.key } } } },
      },
    },
  });
  if (!tournament || !tournament.activity.usesAcademicFormat) return null;
  const filename = `${tournament.slug}-schedule.csv`;

  if (tournament.events.length > 0) {
    // In time order, Varsity before JV at the same time.
    const rank = new Map(sortDivisions(tournament.divisions).map((d, i) => [d.id, i]));
    const divisionName = new Map(tournament.divisions.map((d) => [d.id, d.name]));
    const rankOf = (id: string | null) => (id ? (rank.get(id) ?? rank.size) + 1 : 0);
    const events = [...tournament.events].sort(
      (a, b) => a.date.getTime() - b.date.getTime() || rankOf(a.divisionId) - rankOf(b.divisionId)
    );
    const rows = events.map((e) => [
      format(e.date, "yyyy-MM-dd"),
      format(e.date, "HH:mm"),
      e.endDate ? format(e.endDate, "HH:mm") : "",
      e.title,
      e.divisionId ? divisionName.get(e.divisionId) : "",
      e.location,
      e.fieldValues[0]?.value,
    ]);
    return { filename, csv: toCsv(HEADER, rows) };
  }

  const rows = SAMPLE.map(([day, start, end, title, team, venue, runBy]) => [
    format(addDays(tournament.startDate, day - 1), "yyyy-MM-dd"),
    start,
    end,
    title,
    team,
    venue,
    runBy,
  ]);
  return { filename, csv: toCsv(HEADER, rows) };
}
