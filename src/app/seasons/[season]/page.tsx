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
  const nextLiveEvent = hasDivisions
    ? null
    : await prisma.event.findFirst({
        where: { tournamentId: tournament.id, status: "SCHEDULED", streamUrl: { not: null } },
        orderBy: { date: "asc" },
      });

  const nextLiveEventsByDivision = hasDivisions
    ? await prisma.event.findMany({
        where: {
          tournamentId: tournament.id,
          divisionId: { in: tournament.activity.divisions.map((d) => d.id) },
          status: "SCHEDULED",
          streamUrl: { not: null },
        },
        orderBy: { date: "asc" },
        distinct: ["divisionId"],
      })
    : [];
  const nextLiveEventByDivisionId = new Map(nextLiveEventsByDivision.map((e) => [e.divisionId, e]));

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
                <TournamentSubNav
                  tournamentSlug={tournament.slug}
                  divisionSlug={division.slug}
                  liveStreamUrl={nextLiveEventByDivisionId.get(division.id)?.streamUrl}
                />
              </section>
            ))}
          </div>
        ) : (
          <TournamentSubNav tournamentSlug={tournament.slug} liveStreamUrl={nextLiveEvent?.streamUrl} />
        )}
      </div>
    </div>
  );
}
