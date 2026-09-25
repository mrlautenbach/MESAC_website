import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { pickView } from "@/lib/viewSwitch";
import { BowlResults } from "@/components/BowlViews";
import { TournamentResults } from "@/components/TournamentGames";

export const dynamic = "force-dynamic";

export default async function DivisionResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; division: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { season: tournamentSlug, division: divisionSlug } = await params;
  const { view } = await searchParams;
  const tournament = await prisma.tournament.findUnique({
    where: { slug: tournamentSlug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();

  const division = tournament.divisions.find((d) => d.slug === divisionSlug);
  if (!division) notFound();
  const viewSwitch = pickView(tournament.activity, view);

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

      <TournamentSubNav
        tournamentSlug={tournament.slug}
        divisions={tournament.divisions}
        usesMeetResults={tournament.activity.usesMeetResults}
        usesAcademicFormat={tournament.activity.usesAcademicFormat}
        currentDivisionSlug={division.slug}
        active="results"
        viewSwitch={viewSwitch}
      />
      <div className="page-wrap py-8">
        {tournament.activity.usesAcademicFormat ? (
          viewSwitch?.current === "bowl" ? (
            <BowlResults tournamentId={tournament.id} divisionId={division.id} />
          ) : (
            <p className="text-muted">Results will be posted here once the competitions begin.</p>
          )
        ) : (
          <TournamentResults
            tournamentId={tournament.id}
            tournamentSlug={tournament.slug}
            divisionId={division.id}
            activity={tournament.activity}
          />
        )}
      </div>
    </div>
  );
}
