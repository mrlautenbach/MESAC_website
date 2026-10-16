import Link from "next/link";
import { format } from "date-fns";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadMeetEditor } from "@/lib/scheduleEditor";
import { MeetScheduleImportForm } from "@/components/MeetScheduleImportForm";
import { MeetProgramEditor } from "@/components/MeetProgramEditor";

export default async function MeetSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ tournament?: string }>;
}) {
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

  const editor = await loadMeetEditor(tournamentId);
  if (!editor) notFound();
  const { tournament, props } = editor;

  return (
    <div className="page-wrap space-y-8 py-8">
      <div>
        <Link
          href={`/dashboard/admin/tournaments/${tournament.activityId}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          &larr; {tournament.activity.name}
        </Link>
        <h1 className="mt-1 text-2xl">Meet schedule &amp; program</h1>
        <p className="text-muted">
          {tournament.activity.name} · {tournament.name}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg">Program</h2>
        <div className="max-w-3xl space-y-1 text-sm text-muted">
          <p>
            Every round of every event, session by session. Change any cell, then save. <b>↑</b>/<b>↓</b> swaps an
            event with the one next to it in its session - their numbers and times trade places, and its prelim or
            final moves with it. <b>+</b> adds an event after it (later events move up a number); <b>✕</b> deletes a
            round. Type a new session name to start a new session.
          </p>
          <p>Nothing changes on the site until you press Save. Results already entered aren&apos;t affected.</p>
        </div>
        <MeetProgramEditor {...props} />
      </section>

      {tournament.events.length > 0 && (
        <section className="max-w-2xl">
          <h2 className="mb-3 text-lg">Sessions</h2>
          <ul className="space-y-1.5 text-sm">
            {tournament.events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-0">
                <span>
                  {event.title ? <span className="font-medium">{event.title}</span> : <span className="text-muted">(untitled)</span>} ·{" "}
                  <span className="text-muted">{format(event.date, "MMM d, yyyy")}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {event._count.programEntries} round{event._count.programEntries === 1 ? "" : "s"}
                  <Link href={`/dashboard/events/${event.id}`} className="font-semibold text-primary hover:underline">
                    Edit session
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="max-w-2xl">
        <details>
          <summary className="cursor-pointer text-lg font-bold">Upload a whole program from a CSV instead</summary>
          <p className="mb-3 mt-2 text-sm text-muted">
            One CSV sets up sessions and named events together - a session is created automatically the first time a
            row references it by name.
          </p>
          <MeetScheduleImportForm tournamentId={tournament.id} divisions={tournament.divisions} />
        </details>
      </section>
    </div>
  );
}
