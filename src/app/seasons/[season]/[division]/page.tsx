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
  const { season: seasonSlug, division: divisionSlug } = await params;
  const season = await prisma.season.findUnique({
    where: { slug: seasonSlug },
    include: { tournament: { include: { divisions: true } }, hostSchool: true },
  });
  if (!season) notFound();

  const division = season.tournament.divisions.find((d) => d.slug === divisionSlug);
  if (!division) notFound();

  return (
    <div>
      <SeasonHero
        tournamentName={season.tournament.name}
        tournamentSport={season.tournament.sport}
        tournamentSlug={season.tournament.slug}
        seasonName={season.name}
        divisionName={division.name}
        startDate={season.startDate}
        endDate={season.endDate}
        hostSchoolName={season.hostSchool?.name}
        scoringType={season.tournament.scoringType}
        isCurrent={season.isCurrent}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <SeasonStandingsAndSchedule
          seasonId={season.id}
          seasonSlug={season.slug}
          divisionId={division.id}
          tournament={season.tournament}
        />
      </div>
    </div>
  );
}
