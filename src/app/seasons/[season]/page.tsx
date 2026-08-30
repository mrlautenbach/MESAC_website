import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonStandingsAndSchedule } from "@/components/SeasonStandingsAndSchedule";
import { SeasonHero } from "@/components/SeasonHero";

export const dynamic = "force-dynamic";

export default async function SeasonPage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const season = await prisma.season.findUnique({
    where: { slug },
    include: { tournament: { include: { divisions: true } }, hostSchool: true },
  });
  if (!season) notFound();

  const hasDivisions = season.tournament.divisions.length > 0;

  return (
    <div>
      <SeasonHero
        tournamentName={season.tournament.name}
        tournamentSport={season.tournament.sport}
        tournamentSlug={season.tournament.slug}
        seasonName={season.name}
        startDate={season.startDate}
        endDate={season.endDate}
        hostSchoolName={season.hostSchool?.name}
        scoringType={season.tournament.scoringType}
        isCurrent={season.isCurrent}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {hasDivisions ? (
          <section>
            <h4 className="mb-3">Divisions</h4>
            <ul className="flex flex-wrap gap-3">
              {season.tournament.divisions.map((division) => (
                <li key={division.id}>
                  <Link href={`/seasons/${season.slug}/${division.slug}`} className="btn btn-primary">
                    {division.name} &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <SeasonStandingsAndSchedule seasonId={season.id} seasonSlug={season.slug} tournament={season.tournament} />
        )}
      </div>
    </div>
  );
}
