import Link from "next/link";
import { format } from "date-fns";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MeetScheduleImportForm } from "@/components/MeetScheduleImportForm";

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

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      activity: true,
      divisions: true,
      events: { orderBy: { date: "asc" }, include: { _count: { select: { programEntries: true } } } },
    },
  });
  if (!tournament) notFound();

  if (!tournament.activity.usesMeetResults) {
    return (
      <div className="page-wrap py-8 [&>*]:max-w-2xl">
        <p className="text-danger">This activity doesn&apos;t use meet results.</p>
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6 py-8 [&>*]:max-w-2xl">
      <div>
        <Link href="/dashboard/admin/tournaments" className="text-sm font-semibold text-primary hover:underline">
          &larr; Activities
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Meet schedule &amp; program</h1>
        <p className="text-muted">
          {tournament.activity.name} · {tournament.name}
        </p>
      </div>

      {tournament.events.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Sessions</h2>
          <ul className="space-y-1.5 text-sm">
            {tournament.events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-0">
                <span>
                  {event.title ? <span className="font-medium">{event.title}</span> : <span className="text-muted">(untitled)</span>} ·{" "}
                  <span className="text-muted">{format(event.date, "MMM d, yyyy")}</span>
                </span>
                <span className="text-xs text-muted">
                  {event._count.programEntries} round{event._count.programEntries === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Import schedule &amp; program</h2>
        <p className="-mt-1 mb-3 text-sm text-muted">
          One CSV sets up sessions and named events together - a session is created automatically the first time a
          row references it by name.
        </p>
        <MeetScheduleImportForm tournamentId={tournament.id} divisions={tournament.divisions} />
      </section>
    </div>
  );
}
