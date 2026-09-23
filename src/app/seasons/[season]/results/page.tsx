import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { TournamentResults } from "@/components/TournamentGames";

export const dynamic = "force-dynamic";

export default async function TournamentResultsPage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();
  // Non-meet activities with divisions have no combined page - each division
  // gets its own results. Meet-style activities (Swimming, Track & Field)
  // use this page as the "Overall" view across every division instead.
  const hasDivisions = tournament.divisions.length > 0;
  if (hasDivisions && !tournament.activity.usesMeetResults) notFound();

  return (
    <div>
      <SeasonHero
        activityName={tournament.activity.name}
        activitySport={tournament.activity.sport}
        activitySlug={tournament.activity.slug}
        tournamentName={tournament.name}
        divisionName={hasDivisions ? "Overall" : undefined}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        hostSchoolName={tournament.hostSchool?.name}
        hostSchoolLogoUrl={tournament.hostSchool?.logoUrl}
        archived={tournament.archived}
      />

      <TournamentSubNav
        tournamentSlug={tournament.slug}
        divisions={tournament.divisions}
        usesMeetResults={tournament.activity.usesMeetResults}
        active="results"
      />
      <div className="page-wrap py-8">
        <TournamentResults tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
      </div>
    </div>
  );
}
