import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { GolfIndividualSchedule, GolfTeamSchedule } from "@/components/GolfViews";
import { TournamentSchedule } from "@/components/TournamentGames";
import { AcademicTimeline } from "@/components/AcademicTimeline";
import { BowlSchedule } from "@/components/BowlViews";
import { pickView } from "@/lib/viewSwitch";
import { tournamentPageTitle } from "@/lib/pageTitles";
import { clockFor } from "@/lib/timeView";

export async function generateMetadata({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  return { title: await tournamentPageTitle(season, "schedule") };
}

export const dynamic = "force-dynamic";

export default async function TournamentSchedulePage({
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
  // gets its own schedule. Meet-style activities (Swimming, Track & Field)
  // use this page as the "Overall" view across every division instead, and
  // Academic Games as Varsity and JV side by side.
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
        active="schedule"
        viewSwitch={viewSwitch}
      />
      <div className="page-wrap py-8">
        <h4 className="mb-3">Schedule</h4>
        {academic ? (
          viewSwitch?.current === "bowl" ? (
            <BowlSchedule clock={clock} tournamentId={tournament.id} />
          ) : (
            <AcademicTimeline clock={clock} tournamentId={tournament.id} tournamentSlug={tournament.slug} />
          )
        ) : golfView === "individual" ? (
          <GolfIndividualSchedule clock={clock} tournamentId={tournament.id} />
        ) : golfView === "team" ? (
          <GolfTeamSchedule clock={clock} tournamentId={tournament.id} />
        ) : (
          <TournamentSchedule clock={clock} tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
        )}
      </div>
    </div>
  );
}
