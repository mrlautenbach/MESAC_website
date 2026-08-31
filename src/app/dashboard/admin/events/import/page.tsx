import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EventImportForm } from "@/components/EventImportForm";

export default async function ImportEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [seasons, schools] = await Promise.all([
    prisma.season.findMany({
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
      include: { tournament: { include: { divisions: true, fields: { orderBy: { order: "asc" } } } } },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (seasons.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">Bulk import games</h1>
        <p className="text-muted">Create a tournament and season first before importing a schedule.</p>
      </div>
    );
  }

  const seasonOptions = seasons.map((s) => ({
    id: s.id,
    label: `${s.tournament.name} — ${s.name}${s.isCurrent ? "" : " (archived)"}`,
    divisions: s.tournament.divisions.map((d) => ({ id: d.id, name: d.name })),
    fields: s.tournament.fields.map((f) => ({ id: f.id, key: f.key, label: f.label })),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Bulk import games</h1>
        <Link href="/dashboard/admin/events/new" className="text-sm font-semibold text-primary hover:underline">
          Add one game instead &rarr;
        </Link>
      </div>
      <p className="mb-6 text-muted">
        For a weekend tournament with a full round-robin bracket, upload a spreadsheet of every game instead of
        entering them one at a time.
      </p>
      <EventImportForm seasons={seasonOptions} schoolCodes={schools.map((s) => ({ code: s.code ?? "", name: s.name }))} />
    </div>
  );
}
