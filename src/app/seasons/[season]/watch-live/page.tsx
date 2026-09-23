import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EARLIEST_FIRST } from "@/lib/eventOrder";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { EventRows } from "@/components/EventRows";

export const dynamic = "force-dynamic";

// One combined list of every stream link for the whole tournament - both
// divisions together, since a stream is watched the same way regardless of
// which side of the bracket it's on. No scores here; that's the Results
// page's job.
export default async function WatchLivePage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();

  const hasDivisions = tournament.divisions.length > 0;

  const events = await prisma.event.findMany({
    // Every event with a stream link, regardless of status - each row
    // shows its own status tag so a completed or cancelled game reads as
    // such instead of being hidden entirely.
    where: { tournamentId: tournament.id, streamUrl: { not: null } },
    orderBy: EARLIEST_FIRST,
    include: {
      participants: { include: { school: true } },
      division: true,
      homeSourceEvent: { select: { externalId: true } },
      awaySourceEvent: { select: { externalId: true } },
    },
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
        archived={tournament.archived}
      />

      <TournamentSubNav
        tournamentSlug={tournament.slug}
        divisions={tournament.divisions}
        usesMeetResults={tournament.activity.usesMeetResults}
        active="watch-live"
      />
      <div className="page-wrap py-8">
        <h4 className="mb-3">Watch live</h4>

        {events.length === 0 ? (
          <p className="text-muted">No live streams have been added yet.</p>
        ) : (
          <EventRows
            events={events.map((event) => ({ ...event, results: [], sets: [], fieldValues: [] }))}
            customFields={[]}
            tournamentSlug={tournament.slug}
            // No scores or sets on this page - it's a list of streams, not
            // results. Court comes along with the shared row and is useful
            // here too.
            scoringType="NONE"
            usesSetScores={false}
            showDivisionTag={hasDivisions}
            showWatch
          />
        )}
      </div>
    </div>
  );
}
