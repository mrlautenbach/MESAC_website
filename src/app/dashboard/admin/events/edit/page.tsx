import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { loadGameEditor } from "@/lib/scheduleEditor";
import { GameScheduleEditor } from "@/components/GameScheduleEditor";

// Saving runs as a server action on this page, so this is its time limit
// too - the same room as the CSV import for a whole weekend's changes.
export const maxDuration = 60;

// A tournament's games as an editable table: change any cell, move, add or
// delete games, then save - no CSV round trip needed.
export default async function EditSchedulePage({ searchParams }: { searchParams: Promise<{ tournament?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tournament: tournamentId } = await searchParams;
  if (!tournamentId) notFound();

  const editor = await loadGameEditor(tournamentId);
  if (!editor) notFound();
  const { tournament, props } = editor;

  return (
    <div className="page-wrap space-y-6 py-8">
      <div>
        <Link
          href={`/dashboard/admin/tournaments/${tournament.activityId}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          &larr; {tournament.activity.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl">Edit schedule</h1>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <Link href={`/seasons/${tournament.slug}/schedule`} className="text-primary hover:underline">
              View public schedule
            </Link>
            <Link href={`/dashboard/admin/events/import?tournament=${tournament.id}`} className="text-primary hover:underline">
              Upload a CSV instead
            </Link>
          </div>
        </div>
        <p className="text-muted">
          {tournament.activity.name} · {tournament.name}
        </p>
      </div>

      <div className="max-w-3xl space-y-1 text-sm text-muted">
        <p>
          Change any cell, then save - only the games you touch are updated. <b>↑</b>/<b>↓</b> swaps a game&apos;s
          date, time and court with the game next to it; <b>+</b> adds a game after it; <b>✕</b> deletes it.
          Nothing changes on the site until you press Save.
        </p>
        <p>
          Home and away take a school&apos;s code or name, or a side still to be decided: <code>Winner of G1</code>,{" "}
          <code>Loser of G1</code>, a standing like <code>1st</code>, or <code>TBD</code> (<code>TBD(Local)</code>{" "}
          to show a name). Emptying a score clears it.
        </p>
      </div>

      <GameScheduleEditor {...props} />
    </div>
  );
}
