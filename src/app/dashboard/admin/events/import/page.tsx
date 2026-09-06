import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EventImportForm } from "@/components/EventImportForm";

export default async function ImportEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tournament?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tournament: defaultTournamentId } = await searchParams;

  const [tournaments, schools] = await Promise.all([
    prisma.tournament.findMany({
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
      include: { activity: { include: { fields: { orderBy: { order: "asc" } } } }, divisions: true },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (tournaments.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">Bulk import games</h1>
        <p className="text-muted">Create an activity and tournament first before importing a schedule.</p>
      </div>
    );
  }

  const tournamentOptions = tournaments.map((t) => ({
    id: t.id,
    label: `${t.activity.name} · ${t.name}${t.isCurrent ? "" : " (archived)"}`,
    divisions: t.divisions.map((d) => ({ id: d.id, name: d.name })),
    fields: t.activity.fields.map((f) => ({ id: f.id, key: f.key, label: f.label })),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Bulk import games</h1>
        <Link
          href={`/dashboard/admin/events/new${defaultTournamentId ? `?tournament=${defaultTournamentId}` : ""}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Add one game instead &rarr;
        </Link>
      </div>
      <p className="mb-6 text-muted">
        For a weekend tournament with a full round-robin bracket, upload a spreadsheet of every game instead of
        entering them one at a time.
      </p>
      <EventImportForm
        seasons={tournamentOptions}
        schoolCodes={schools.map((s) => ({ code: s.code ?? "", name: s.name }))}
        defaultTournamentId={defaultTournamentId}
      />
    </div>
  );
}
