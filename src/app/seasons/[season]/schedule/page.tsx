import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { TournamentSchedule } from "@/components/TournamentGames";

export const dynamic = "force-dynamic";

export default async function TournamentSchedulePage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: { include: { divisions: true } }, hostSchool: true },
  });
  if (!tournament) notFound();
  if (tournament.activity.divisions.length > 0) notFound();

  return (
    <div>
      <SeasonHero
        activityName={tournament.activity.name}
        activitySport={tournament.activity.sport}
        activitySlug={tournament.activity.slug}
        tournamentName={tournament.name}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        hostSchoolName={tournament.hostSchool?.name}
        hostSchoolLogoUrl={tournament.hostSchool?.logoUrl}
        archived={tournament.archived}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <TournamentSubNav tournamentSlug={tournament.slug} active="schedule" />
        <h4 className="mb-3">Schedule</h4>
        <TournamentSchedule tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
      </div>
    </div>
  );
}
