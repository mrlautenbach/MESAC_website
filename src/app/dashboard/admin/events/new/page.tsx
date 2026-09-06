import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EventForm } from "@/components/EventForm";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [tournaments, schools] = await Promise.all([
    prisma.tournament.findMany({
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
      include: { activity: true, divisions: true },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (tournaments.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">New event</h1>
        <p className="text-muted">Create an activity and tournament first before adding events.</p>
      </div>
    );
  }

  const tournamentOptions = tournaments.map((t) => ({
    id: t.id,
    label: `${t.activity.name} · ${t.name}${t.isCurrent ? "" : " (archived)"}`,
    divisions: t.divisions.map((d) => ({ id: d.id, name: d.name })),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">New event</h1>
        <Link href="/dashboard/admin/events/import" className="text-sm font-semibold text-primary hover:underline">
          Bulk import a whole schedule &rarr;
        </Link>
      </div>
      <EventForm seasons={tournamentOptions} schools={schools} />
    </div>
  );
}
