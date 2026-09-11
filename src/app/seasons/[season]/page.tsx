import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";

export const dynamic = "force-dynamic";

export default async function SeasonPage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();

  const hasDivisions = tournament.divisions.length > 0;
  // Meet-style activities (Swimming, Track & Field) show a combined Overall
  // section - every event regardless of division - ahead of the per-division
  // ones, since a meet's events aren't naturally split like a team sport's
  // are. Watch Live/Team Photos then only need to appear once, on Overall.
  const showOverall = hasDivisions && tournament.activity.usesMeetResults;

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
            {showOverall && (
              <section>
                <h4 className="mb-3">Overall</h4>
                <TournamentSubNav tournamentSlug={tournament.slug} />
              </section>
            )}
            {tournament.divisions.map((division) => (
              <section key={division.id}>
                <h4 className="mb-3">{division.name}</h4>
                <TournamentSubNav
                  tournamentSlug={tournament.slug}
                  divisionSlug={division.slug}
                  showWatchAndPhotos={!showOverall}
                />
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
