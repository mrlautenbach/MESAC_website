import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { GolfIndividualSchedule, GolfTeamSchedule } from "@/components/GolfViews";
import { TournamentSchedule } from "@/components/TournamentGames";
import { AcademicTimeline } from "@/components/AcademicTimeline";

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
  // Non-meet activities with divisions have no combined page - each division
  // gets its own schedule. Meet-style activities (Swimming, Track & Field)
  // use this page as the "Overall" view across every division instead, and
  // Academic Games as Varsity and JV side by side.
  const hasDivisions = tournament.divisions.length > 0;
  const academic = tournament.activity.usesAcademicFormat;
  if (hasDivisions && !tournament.activity.usesMeetResults && !academic) notFound();
  const golfView = tournament.activity.usesGolfFormat ? (view === "team" ? "team" : "individual") : undefined;

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

      <TournamentSubNav
        tournamentSlug={tournament.slug}
        divisions={tournament.divisions}
        usesMeetResults={tournament.activity.usesMeetResults}
        usesAcademicFormat={tournament.activity.usesAcademicFormat}
        active="schedule"
        golfView={golfView}
      />
      <div className="page-wrap py-8">
        <h4 className="mb-3">Schedule</h4>
        {academic ? (
          <AcademicTimeline tournamentId={tournament.id} />
        ) : golfView === "individual" ? (
          <GolfIndividualSchedule tournamentId={tournament.id} />
        ) : golfView === "team" ? (
          <GolfTeamSchedule tournamentId={tournament.id} />
        ) : (
          <TournamentSchedule tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
        )}
      </div>
    </div>
  );
}
