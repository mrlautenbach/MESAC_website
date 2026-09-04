import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SeasonStandingsAndSchedule } from "@/components/SeasonStandingsAndSchedule";
import { SeasonHero } from "@/components/SeasonHero";

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
        isCurrent={tournament.isCurrent}
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap gap-3">
          {!hasDivisions && (
            <>
              <a href="#schedule" className="btn btn-secondary">
                Schedule
              </a>
              <a href="#results" className="btn btn-secondary">
                Results
              </a>
            </>
          )}
          <Link href={`/seasons/${tournament.slug}/team-photos`} className="btn btn-secondary">
            Team photos
          </Link>
          {nextLiveEvent?.streamUrl && (
            <a href={nextLiveEvent.streamUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Watch live &rarr;
            </a>
          )}
        </div>

        {hasDivisions ? (
          <section>
            <h4 className="mb-3">Divisions</h4>
            <ul className="flex flex-wrap gap-3">
              {tournament.activity.divisions.map((division) => (
                <li key={division.id}>
                  <Link href={`/seasons/${tournament.slug}/${division.slug}`} className="btn btn-primary">
                    {division.name} &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <SeasonStandingsAndSchedule tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
        )}
      </div>
    </div>
  );
}
