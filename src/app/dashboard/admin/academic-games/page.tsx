import Link from "next/link";
import { format } from "date-fns";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AcademicScheduleForm } from "@/components/AcademicScheduleForm";
import { RUN_BY_FIELD, formatTimeRange, sortDivisions } from "@/lib/academicGames";

// The Academic Games timeline for one tournament: the CSV upload, and the
// schedule as it stands, each item linking to its own edit page.
export default async function AcademicGamesAdminPage({ searchParams }: { searchParams: Promise<{ tournament?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return (
      <div className="page-wrap py-10 [&>*]:max-w-2xl">
        <p className="text-danger">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const { tournament: tournamentId } = await searchParams;
  if (!tournamentId) notFound();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: {
        orderBy: { date: "asc" },
        include: { division: true, fieldValues: { where: { field: { key: RUN_BY_FIELD.key } } } },
      },
    },
  });
  if (!tournament) notFound();
  if (!tournament.activity.usesAcademicFormat) {
    return (
      <div className="page-wrap py-8 [&>*]:max-w-2xl">
        <p className="text-danger">This activity doesn&apos;t use the Academic Games format.</p>
      </div>
    );
  }

  const rank = new Map(sortDivisions(tournament.divisions).map((d, i) => [d.id, i + 1]));
  const events = [...tournament.events].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (rank.get(a.divisionId ?? "") ?? 0) - (rank.get(b.divisionId ?? "") ?? 0)
  );
  const days = [...new Set(events.map((e) => format(e.date, "yyyy-MM-dd")))];
  const noVenue = events.filter((e) => !e.location).length;

  return (
    <div className="page-wrap space-y-10 py-8 [&>*]:max-w-3xl">
      <div>
        <Link href={`/dashboard/admin/tournaments/${tournament.activityId}`} className="text-sm font-semibold text-primary-dark hover:underline">
          ← {tournament.activity.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {tournament.activity.name} <span className="font-normal text-muted">· {tournament.name}</span>
        </h1>
        <p className="mt-1 text-sm">
          <Link href={`/seasons/${tournament.slug}/schedule`} className="font-semibold text-primary hover:underline">
            View public schedule →
          </Link>
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Schedule ({events.length} competitions)</h2>
          <p className="mt-1 text-sm text-muted">
            One row per competition. Columns: <code>date</code> (YYYY-MM-DD), <code>start</code> and{" "}
            <code>end</code> (13:45 or 1:45pm), <code>title</code>, <code>team</code> (<code>varsity</code>,{" "}
            <code>jv</code>, or blank when every team takes part), <code>venue</code>, and <code>run_by</code> (the
            school running it, e.g. AS Dubai). The Varsity and JV divisions are added the first time the file uses
            them.
          </p>
          <p className="mt-1 text-sm text-muted">
            The file is the whole schedule: re-uploading updates each competition in place (matched by its date,
            title and team) and removes any that are no longer in it. The{" "}
            <a
              href={`/dashboard/admin/academic-games/examples?tournament=${tournament.id}`}
              download
              className="font-semibold text-primary hover:underline"
            >
              example CSV
            </a>{" "}
            {events.length
              ? "is the schedule as it stands - download it, edit it, and upload it again."
              : "is the 2025 schedule's competitions moved onto this tournament's dates - fill in the venues and adjust the times."}
          </p>
        </div>
        <AcademicScheduleForm
          tournamentId={tournament.id}
          exampleHref={`/dashboard/admin/academic-games/examples?tournament=${tournament.id}`}
        />
      </section>

      {events.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Current schedule</h2>
            {noVenue > 0 && (
              <p className="mt-1 text-sm text-muted">
                {noVenue} competition{noVenue === 1 ? " has" : "s have"} no venue yet - they show as &quot;Venue
                TBC&quot; on the public page.
              </p>
            )}
          </div>
          {days.map((day) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-bold">{format(new Date(`${day}T00:00:00`), "EEEE d MMMM")}</h3>
              <div className="overflow-x-auto">
                <table className="mtable text-sm">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Team</th>
                      <th>Competition</th>
                      <th>Venue</th>
                      <th>
                        <span className="sr-only">Edit</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events
                      .filter((e) => format(e.date, "yyyy-MM-dd") === day)
                      .map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap tabular-nums">{formatTimeRange(e.date, e.endDate)}</td>
                          <td className="whitespace-nowrap">{e.division?.name ?? "All teams"}</td>
                          <td>
                            <span className="font-semibold">{e.title}</span>
                            {e.fieldValues[0] && <span className="text-muted"> · run by {e.fieldValues[0].value}</span>}
                          </td>
                          <td className={e.location ? "" : "text-muted"}>{e.location ?? "TBC"}</td>
                          <td className="text-right">
                            <Link href={`/dashboard/events/${e.id}`} className="font-semibold text-primary hover:underline">
                              Edit
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
