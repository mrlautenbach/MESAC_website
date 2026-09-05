import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";

export const dynamic = "force-dynamic";

export default async function SeasonPage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: { include: { divisions: true } }, hostSchool: true },
  });
  if (!tournament) notFound();

  const hasDivisions = tournament.activity.divisions.length > 0;

  return (
    <div>
      <SeasonHero
        activityName={tournament.activity.name}
        activitySport={tournament.activity.sport}
        activitySlug={tournament.activity.slug}
        tournamentName={tournament.name}
        startDate={tournament.startDate}
        endDate={tournament.endDate}
        hostSchoolName={tournament.hostSchool?.name}
        hostSchoolLogoUrl={tournament.hostSchool?.logoUrl}
        archived={tournament.archived}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {hasDivisions ? (
          <div className="space-y-8">
            {tournament.activity.divisions.map((division) => (
              <section key={division.id}>
                <h4 className="mb-3">{division.name}</h4>
                <TournamentSubNav tournamentSlug={tournament.slug} divisionSlug={division.slug} />
              </section>
            ))}
          </div>
        ) : (
          <TournamentSubNav tournamentSlug={tournament.slug} />
        )}
      </div>
    </div>
  );
}
