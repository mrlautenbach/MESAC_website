import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { TeamPhotoSlot } from "@/components/TeamPhotoSlot";
import { TeamPhotoGenderToggle } from "@/components/TeamPhotoGenderToggle";

export default async function TournamentPhotosAdminPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { tournamentId } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: true, divisions: true },
  });
  if (!tournament) notFound();

  const [schools, teamPhotos] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: "asc" } }),
    prisma.teamPhoto.findMany({ where: { tournamentId } }),
  ]);

  const divisions = tournament.divisions.length > 0 ? tournament.divisions : [null];
  const slotByKey = new Map(teamPhotos.map((p) => [`${p.schoolId}:${p.divisionId ?? "none"}`, p]));

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <Link href="/dashboard/admin/tournaments" className="text-sm font-semibold text-primary-dark hover:underline">
          &larr; Tournaments
        </Link>
        <h1 className="mt-2 mb-1 text-2xl font-bold">Team photos</h1>
        <p className="text-sm text-muted">
          {tournament.activity.name} · {tournament.name}. Turn off any slot a school isn&apos;t fielding this year.
        </p>
      </div>

      {tournament.divisions.length > 0 && (
        <TeamPhotoGenderToggle
          tournamentId={tournamentId}
          showGirlsTeamPhotos={tournament.showGirlsTeamPhotos}
          showBoysTeamPhotos={tournament.showBoysTeamPhotos}
        />
      )}

      {divisions.map((division) => (
        <div key={division?.id ?? "all"}>
          {division && <h2 className="mb-3 text-lg font-bold">{division.name}</h2>}
          <div className="grid gap-3 sm:grid-cols-2">
            {schools.map((school) => {
              const key = `${school.id}:${division?.id ?? "none"}`;
              const record = slotByKey.get(key);
              return (
                <TeamPhotoSlot
                  key={key}
                  tournamentId={tournamentId}
                  schoolId={school.id}
                  schoolName={school.name}
                  divisionId={division?.id ?? null}
                  enabled={record?.enabled ?? true}
                  photoUrl={record?.photoUrl ?? null}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
