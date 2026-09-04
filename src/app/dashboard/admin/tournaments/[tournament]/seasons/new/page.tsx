import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SeasonEditionForm } from "@/components/SeasonEditionForm";

export default async function NewSeasonEditionPage({ params }: { params: Promise<{ tournament: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { tournament: activityId } = await params;
  const [activity, schools] = await Promise.all([
    prisma.activity.findUnique({ where: { id: activityId }, include: { tournaments: true } }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!activity) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">
        {activity.tournaments.length === 0 ? "Create first tournament" : "Start new tournament"}
      </h1>
      <p className="mb-6 text-muted">{activity.name}</p>
      <SeasonEditionForm
        tournamentId={activity.id}
        schools={schools}
        isFirstEdition={activity.tournaments.length === 0}
        defaultHostSchoolId={activity.defaultHostSchoolId}
      />
    </div>
  );
}
