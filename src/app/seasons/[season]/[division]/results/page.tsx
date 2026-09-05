import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { TournamentResults } from "@/components/TournamentGames";

export const dynamic = "force-dynamic";

export default async function DivisionResultsPage({
  params,
}: {
  params: Promise<{ season: string; division: string }>;
}) {
  const { season: tournamentSlug, division: divisionSlug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug: tournamentSlug },
    include: { activity: { include: { divisions: true } }, hostSchool: true },
  });
  if (!tournament) notFound();

  const division = tournament.activity.divisions.find((d) => d.slug === divisionSlug);
  if (!division) notFound();

  return (
    <div>
      <SeasonHero
        activityName={tournament.activity.name}
        activitySport={tournament.activity.sport}
        activitySlug={tournament.activity.slug}
        tournamentName={tournament.name}
        divisionName={division.name}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        hostSchoolName={tournament.hostSchool?.name}
        hostSchoolLogoUrl={tournament.hostSchool?.logoUrl}
        archived={tournament.archived}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <TournamentSubNav tournamentSlug={tournament.slug} divisionSlug={division.slug} active="results" />
        <TournamentResults
          tournamentId={tournament.id}
          tournamentSlug={tournament.slug}
          divisionId={division.id}
          activity={tournament.activity}
        />
      </div>
    </div>
  );
}
