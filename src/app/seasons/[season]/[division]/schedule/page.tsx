import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { TournamentSchedule } from "@/components/TournamentGames";

export const dynamic = "force-dynamic";

export default async function DivisionSchedulePage({
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

  const nextLiveEvent = await prisma.event.findFirst({
    where: { tournamentId: tournament.id, divisionId: division.id, status: "SCHEDULED", streamUrl: { not: null } },
    orderBy: { date: "asc" },
  });

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
        isCurrent={tournament.isCurrent}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <TournamentSubNav
          tournamentSlug={tournament.slug}
          divisionSlug={division.slug}
          active="schedule"
          liveStreamUrl={nextLiveEvent?.streamUrl}
        />
        <h4 className="mb-3">Schedule</h4>
        <TournamentSchedule
          tournamentId={tournament.id}
          tournamentSlug={tournament.slug}
          divisionId={division.id}
          activity={tournament.activity}
        />
      </div>
    </div>
  );
}
