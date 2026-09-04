import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonStandingsAndSchedule } from "@/components/SeasonStandingsAndSchedule";
import { SeasonHero } from "@/components/SeasonHero";

export const dynamic = "force-dynamic";

export default async function DivisionPage({
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
        isCurrent={tournament.isCurrent}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <SeasonStandingsAndSchedule
          tournamentId={tournament.id}
          tournamentSlug={tournament.slug}
          divisionId={division.id}
          activity={tournament.activity}
        />
      </div>
    </div>
  );
}
