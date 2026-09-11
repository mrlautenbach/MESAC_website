import Link from "next/link";
import { format } from "date-fns";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MeetProgramImportForm } from "@/components/MeetProgramImportForm";

export default async function MeetProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ tournament?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
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
      events: { orderBy: { date: "asc" }, include: { _count: { select: { programEntries: true } } } },
    },
  });
  if (!tournament) notFound();

  if (!tournament.activity.usesMeetResults) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-danger">This activity doesn&apos;t use meet results.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <Link href="/dashboard/admin/tournaments" className="text-sm font-semibold text-primary hover:underline">
          &larr; Activities
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Set up meet program</h1>
        <p className="text-muted">
          {tournament.activity.name} · {tournament.name}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Sessions</h2>
        {tournament.events.length === 0 ? (
          <p className="text-sm text-muted">
            No sessions yet - create one from{" "}
            <Link href={`/dashboard/admin/events/new?tournament=${tournament.id}`} className="font-semibold text-primary hover:underline">
              + Add one event
            </Link>{" "}
            first, giving it a title. The program CSV below matches rows to sessions by that title.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {tournament.events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-0">
                <span>
                  {event.title ? <span className="font-medium">{event.title}</span> : <span className="text-muted">(untitled)</span>} ·{" "}
                  <span className="text-muted">{format(event.date, "MMM d, yyyy")}</span>
                </span>
                <span className="text-xs text-muted">
                  {event._count.programEntries} program {event._count.programEntries === 1 ? "entry" : "entries"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Import program</h2>
        <MeetProgramImportForm tournamentId={tournament.id} />
      </section>
    </div>
  );
}
