import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { pickView } from "@/lib/viewSwitch";
import { TournamentSchedule } from "@/components/TournamentGames";
import { AcademicTimeline } from "@/components/AcademicTimeline";
import { BowlSchedule } from "@/components/BowlViews";
import { tournamentPageTitle } from "@/lib/pageTitles";

export async function generateMetadata({ params }: { params: Promise<{ season: string; division: string }> }) {
  const { season, division } = await params;
  return { title: await tournamentPageTitle(season, "schedule", division) };
}

export const dynamic = "force-dynamic";

export default async function DivisionSchedulePage({
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
        active="schedule"
        viewSwitch={viewSwitch}
      />
      <div className="page-wrap py-8">
        <h4 className="mb-3">Schedule</h4>
        {tournament.activity.usesAcademicFormat ? (
          viewSwitch?.current === "bowl" ? (
            <BowlSchedule tournamentId={tournament.id} divisionId={division.id} />
          ) : (
            <AcademicTimeline tournamentId={tournament.id} tournamentSlug={tournament.slug} divisionId={division.id} />
          )
        ) : (
          <TournamentSchedule
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
