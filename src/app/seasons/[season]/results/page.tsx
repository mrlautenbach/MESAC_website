import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { pickView } from "@/lib/viewSwitch";
import { BowlResults } from "@/components/BowlViews";
import { ChallengeResults } from "@/components/ChallengeViews";
import { GolfIndividualResults, GolfTeamResults } from "@/components/GolfViews";
import { TournamentResults } from "@/components/TournamentGames";
import { tournamentPageTitle } from "@/lib/pageTitles";
import { clockFor } from "@/lib/timeView";

export async function generateMetadata({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  return { title: await tournamentPageTitle(season, "results") };
}

export const dynamic = "force-dynamic";

export default async function TournamentResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { season: slug } = await params;
  const { view } = await searchParams;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();
  const clock = await clockFor(tournament);
  // Non-meet activities with divisions have no combined page - each division
  // gets its own results. Meet-style activities (Swimming, Track & Field)
  // use this page as the "Overall" view across every division instead, and
  // Academic Games as both tracks together.
  const hasDivisions = tournament.divisions.length > 0;
  const academic = tournament.activity.usesAcademicFormat;
  if (hasDivisions && !tournament.activity.usesMeetResults && !academic) notFound();
  const viewSwitch = pickView(tournament.activity, view);
  const golfView = tournament.activity.usesGolfFormat ? viewSwitch?.current : undefined;

  return (
    <div>
      <SeasonHero
        activityName={tournament.activity.name}
        activitySport={tournament.activity.sport}
        activitySlug={tournament.activity.slug}
        tournamentName={tournament.name}
        divisionName={hasDivisions && !academic ? "Overall" : undefined}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        hostSchoolName={tournament.hostSchool?.name}
        hostSchoolLogoUrl={tournament.hostSchool?.logoUrl}
        archived={tournament.archived}
      />

      <TournamentSubNav clock={clock}
        tournamentSlug={tournament.slug}
        divisions={tournament.divisions}
        usesMeetResults={tournament.activity.usesMeetResults}
        usesAcademicFormat={tournament.activity.usesAcademicFormat}
        active="results"
        viewSwitch={viewSwitch}
      />
      <div className="page-wrap py-8">
        {academic ? (
          viewSwitch?.current === "bowl" ? (
            <BowlResults clock={clock} tournamentId={tournament.id} />
          ) : (
            <ChallengeResults tournamentId={tournament.id} />
          )
        ) : golfView === "individual" ? (
          <GolfIndividualResults tournamentId={tournament.id} />
        ) : golfView === "team" ? (
          <GolfTeamResults clock={clock} tournamentId={tournament.id} scoring={tournament.activity} />
        ) : (
          <TournamentResults clock={clock} tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
        )}
      </div>
    </div>
  );
}
