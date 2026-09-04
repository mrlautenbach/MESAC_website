import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { DocumentList } from "@/components/DocumentList";
import { sideLabel } from "@/lib/eventDisplay";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ season: string; event: string }>;
}) {
  const { season: tournamentSlug, event: eventSlug } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { slug: tournamentSlug }, include: { activity: true } });
  if (!tournament) notFound();

  const event = await prisma.event.findUnique({
    where: { tournamentId_slug: { tournamentId: tournament.id, slug: eventSlug } },
    include: {
      participants: { include: { school: true } },
      results: { include: { school: true } },
      individualResults: { include: { school: true } },
      photos: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      division: true,
      homeSourceEvent: { select: { externalId: true } },
      awaySourceEvent: { select: { externalId: true } },
    },
  });
  if (!event) notFound();

  const user = await getCurrentUser();
  const participantSchoolIds = event.participants.map((p) => p.schoolId);
  const canEdit = user?.role === "ADMIN" || (user?.role === "EDITOR" && !!user.schoolId && participantSchoolIds.includes(user.schoolId));

  const homeParticipant = event.participants.find((p) => p.isHome);
  const awayParticipant = event.participants.find((p) => !p.isHome);
  const matchupTitle =
    event.participants.length === 2 || event.homeSourceEventId || event.awaySourceEventId
      ? `${sideLabel(homeParticipant, event.homeSourceOutcome, event.homeSourceEvent?.externalId)} vs ${sideLabel(
          awayParticipant,
          event.awaySourceOutcome,
          event.awaySourceEvent?.externalId
        )}`
      : event.participants.map((p) => p.school.name).join(" vs ");

  const individualByschool = new Map<string, typeof event.individualResults>();
  for (const entry of event.individualResults) {
    const list = individualByschool.get(entry.schoolId) ?? [];
    list.push(entry);
    individualByschool.set(entry.schoolId, list);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <Link
          href={event.division ? `/seasons/${tournament.slug}/${event.division.slug}` : `/seasons/${tournament.slug}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          &larr; {tournament.activity.name}
          {event.division ? ` — ${event.division.name}` : ""} ({tournament.name})
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{matchupTitle}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {event.streamUrl && (
              <a href={event.streamUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Watch live
              </a>
            )}
            {canEdit && (
              <Link href={`/dashboard/events/${event.id}`} className="btn btn-primary">
                Enter results / add photos
              </Link>
            )}
          </div>
        </div>
        <p className="mt-1 text-muted">
          {format(event.date, "EEEE, MMM d, yyyy · h:mm a")}
          {event.location ? ` · ${event.location}` : ""}
          {event.externalId ? ` · Game ${event.externalId}` : ""}
        </p>
      </div>

      {tournament.activity.scoringType !== "NONE" && (
        <section className="card p-4">
          <h2 className="mb-3 text-lg font-bold">{tournament.activity.scoringType === "LOW_SCORE" ? "Team result" : "Result"}</h2>
          {event.results.every((r) => r.score === null && r.outcome === null) ? (
            <p className="text-muted">Results haven&apos;t been posted yet.</p>
          ) : (
            <ul className="space-y-2">
              {event.results.map((result) => (
                <li key={result.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <span className="font-medium">{result.school.name}</span>
                  <span className="flex items-center gap-3">
                    {result.outcome && <OutcomeBadge outcome={result.outcome} />}
                    <span className="text-lg font-bold">{result.score ?? "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {tournament.activity.scoringType === "LOW_SCORE" && event.individualResults.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-bold">Individual scores</h3>
              <div className="space-y-3">
                {Array.from(individualByschool.entries()).map(([schoolId, entries]) => (
                  <div key={schoolId}>
                    <p className="text-sm font-semibold text-muted">{entries[0].school.name}</p>
                    <ul className="pl-2 text-sm">
                      {entries
                        .slice()
                        .sort((a, b) => a.score - b.score)
                        .map((entry) => (
                          <li key={entry.id} className="flex justify-between border-b border-border py-1 last:border-0">
                            <span>{entry.athleteName}</span>
                            <span className="font-medium">{entry.score}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {event.recap && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg font-bold">Recap</h2>
          <p className="whitespace-pre-wrap text-foreground">{event.recap}</p>
        </section>
      )}

      {event.documents.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Results documents</h2>
          <DocumentList documents={event.documents} canDelete={false} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Photos</h2>
        {event.photos.length === 0 ? (
          <p className="text-muted">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {event.photos.map((photo) => (
              <figure key={photo.id} className="overflow-hidden rounded-lg border border-border bg-white">
                <div className="relative aspect-square">
                  <Image
                    src={photo.url}
                    alt={photo.altText || photo.caption || "Event photo"}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
                {photo.caption && (
                  <figcaption className="p-2 text-xs text-muted">{photo.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const styles: Record<string, string> = {
    WIN: "bg-green-100 text-green-800",
    LOSS: "bg-red-100 text-red-800",
    DRAW: "bg-gray-100 text-gray-800",
  };
  return <span className={`badge ${styles[outcome] ?? ""}`}>{outcome}</span>;
}
