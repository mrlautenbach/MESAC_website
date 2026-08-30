import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EventForm } from "@/components/EventForm";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [seasons, schools] = await Promise.all([
    prisma.season.findMany({
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
      include: { tournament: { include: { divisions: true } } },
    }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (seasons.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">New event</h1>
        <p className="text-muted">Create a tournament and season first before adding events.</p>
      </div>
    );
  }

  const seasonOptions = seasons.map((s) => ({
    id: s.id,
    label: `${s.tournament.name} — ${s.name}${s.isCurrent ? "" : " (archived)"}`,
    divisions: s.tournament.divisions.map((d) => ({ id: d.id, name: d.name })),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">New event</h1>
      <EventForm seasons={seasonOptions} schools={schools} />
    </div>
  );
}
