import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SeasonEditionForm } from "@/components/SeasonEditionForm";

export default async function NewSeasonEditionPage({ params }: { params: Promise<{ tournament: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { tournament: tournamentId } = await params;
  const [tournament, schools] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, include: { seasons: true } }),
    prisma.school.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!tournament) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">
        {tournament.seasons.length === 0 ? "Create first season" : "Start new season"}
      </h1>
      <p className="mb-6 text-muted">{tournament.name}</p>
      <SeasonEditionForm tournamentId={tournament.id} schools={schools} isFirstEdition={tournament.seasons.length === 0} />
    </div>
  );
}
