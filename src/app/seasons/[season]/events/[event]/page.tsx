import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { DocumentList } from "@/components/DocumentList";
import { MeetResultsView } from "@/components/MeetResultsView";
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
      sets: { orderBy: { setNumber: "asc" } },
      photos: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      division: true,
      homeSourceEvent: { select: { externalId: true } },
      awaySourceEvent: { select: { externalId: true } },
      meetResults: { include: { school: true }, orderBy: { rowOrder: "asc" } },
      programEntries: { orderBy: { eventNumber: "asc" }, include: { division: true } },
    },
  });
  if (!event) notFound();

  // Grouped by event_number, each split into preliminary/final rows sorted
  // by place (unplaced - DQ/NT/etc - last). event_number, not event_name, is
  // this race's identity - a prelim row and a final row sharing the same
  // number pair up into one group even if their names were typed slightly
  // differently between two CSV uploads. Order and division/gender come
  // from the meet program (set up ahead of results) when one's been
  // uploaded for this session; otherwise falls back to first-appearance
  // order in the results CSV itself (rowOrder), same as before the program
  // feature, with no division/gender (nothing to derive them from).
  const meetResultGroups = (() => {
    const byPlace = (a: (typeof event.meetResults)[number], b: (typeof event.meetResults)[number]) =>
      (a.place ?? Infinity) - (b.place ?? Infinity);
    // Division/gender are part of this key too - two program entries can
    // share an event_name+round (e.g. the same race name run for two
    // genders), and each result row carries the division/gender copied from
    // whichever program entry it matched at import time, so this is what
    // keeps their results from bleeding into each other's group.
    const resultKey = (eventName: string, round: "PRELIM" | "FINAL", divisionId: string | null, gender: string | null) =>
      `${eventName.trim().toLowerCase()}::${round}::${divisionId ?? ""}::${gender ?? ""}`;
    const resultsByNameRound = new Map<string, (typeof event.meetResults)[number][]>();
    for (const r of event.meetResults) {
      const key = resultKey(r.eventName, r.round, r.divisionId, r.gender);
      const list = resultsByNameRound.get(key) ?? [];
      list.push(r);
      resultsByNameRound.set(key, list);
    }
    const rowsFor = (
      eventName: string,
      round: "PRELIM" | "FINAL",
      divisionId: string | null = null,
      gender: string | null = null
    ) =>
      (resultsByNameRound.get(resultKey(eventName, round, divisionId, gender)) ?? [])
        .slice()
        .sort(byPlace)
        .map((r) => ({
          id: r.id,
          place: r.place,
          athleteName: r.athleteName,
          schoolName: r.school.name,
          mark: r.mark,
          seedMark: r.seedMark,
          prelimMark: r.prelimMark,
          points: r.points,
          recordNotation: r.recordNotation,
        }));

    if (event.programEntries.length > 0) {
      const order: number[] = [];
      const byNumber = new Map<
        number,
        { prelim?: (typeof event.programEntries)[number]; final?: (typeof event.programEntries)[number] }
      >();
      for (const p of event.programEntries) {
        if (!byNumber.has(p.eventNumber)) {
          order.push(p.eventNumber);
          byNumber.set(p.eventNumber, {});
        }
        byNumber.get(p.eventNumber)![p.round === "PRELIM" ? "prelim" : "final"] = p;
      }
      return order.map((eventNumber) => {
        const entries = byNumber.get(eventNumber)!;
        // Prefer the final round's own name/division/gender when both
        // rounds exist and happen to disagree - the final is the race that
        // counts.
        const primary = entries.final ?? entries.prelim!;
        return {
          key: `program-${eventNumber}`,
          eventNumber,
          eventName: primary.eventName,
          division: primary.division ? { name: primary.division.name, slug: primary.division.slug } : null,
          gender: primary.gender,
          plannedRounds: { prelim: !!entries.prelim, final: !!entries.final },
          prelim: entries.prelim
            ? rowsFor(entries.prelim.eventName, "PRELIM", entries.prelim.divisionId, entries.prelim.gender)
            : [],
          final: entries.final
            ? rowsFor(entries.final.eventName, "FINAL", entries.final.divisionId, entries.final.gender)
            : [],
        };
      });
    }

    // No program uploaded for this session - group by first-appearance order
    // of the actual result rows, exactly as before this feature existed.
    const order: string[] = [];
    const seen = new Set<string>();
    for (const r of event.meetResults) {
      if (!seen.has(r.eventName)) {
        seen.add(r.eventName);
        order.push(r.eventName);
      }
    }
    return order.map((eventName) => {
      const prelim = rowsFor(eventName, "PRELIM");
      const final = rowsFor(eventName, "FINAL");
      return {
        key: `result-${eventName}`,
        eventNumber: null,
        eventName,
        division: null,
        gender: null,
        plannedRounds: { prelim: prelim.length > 0, final: final.length > 0 },
        prelim,
        final,
      };
    });
  })();

  const user = await getCurrentUser();
  const participantSchoolIds = event.participants.map((p) => p.schoolId);
  const canEdit = user?.role === "ADMIN" || (user?.role === "EDITOR" && !!user.schoolId && participantSchoolIds.includes(user.schoolId));

  const homeParticipant = event.participants.find((p) => p.isHome);
  const awayParticipant = event.participants.find((p) => !p.isHome);
  // A meet session never sets any of these source fields; a team game does,
  // even before either side has a concrete school (e.g. both still pending).
  const isPendingDualMatchup =
    event.homeSourceEventId ||
    event.awaySourceEventId ||
    event.homeSourceStanding ||
    event.awaySourceStanding ||
    event.homeSourceLabel ||
    event.awaySourceLabel;
  const matchupTitle =
    event.participants.length === 0 && !isPendingDualMatchup
      ? event.title ?? "Untitled session"
      : event.participants.length === 2 || isPendingDualMatchup
      ? `${sideLabel(
          homeParticipant,
          event.homeSourceOutcome,
          event.homeSourceEvent?.externalId,
          event.homeSourceStanding,
          event.homeSourceLabel
        )} vs ${sideLabel(
          awayParticipant,
          event.awaySourceOutcome,
          event.awaySourceEvent?.externalId,
          event.awaySourceStanding,
          event.awaySourceLabel
        )}`
      : event.participants.map((p) => p.school.name).join(" vs ");

  const individualByschool = new Map<string, typeof event.individualResults>();
  for (const entry of event.individualResults) {
    const list = individualByschool.get(entry.schoolId) ?? [];
    list.push(entry);
    individualByschool.set(entry.schoolId, list);
  }

  return (
    <div className="page-wrap space-y-8 py-8 [&>*]:max-w-4xl">
      <div>
        <Link
          href={
            event.division ? `/seasons/${tournament.slug}/${event.division.slug}/schedule` : `/seasons/${tournament.slug}`
          }
          className="text-sm font-semibold text-primary hover:underline"
        >
          &larr; {tournament.activity.name}
          {event.division ? ` · ${event.division.name}` : ""} ({tournament.name})
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
          {event.location && !tournament.activity.usesMeetResults ? ` · ${event.location}` : ""}
          {event.externalId ? ` · ${tournament.activity.usesMeetResults ? "Session" : "Game"} ${event.externalId}` : ""}
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

          {tournament.activity.usesSetScores && event.sets.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-bold">Set scores</h3>
              <ul className="flex flex-wrap gap-4 text-sm">
                {event.sets.map((s) => (
                  <li key={s.id} className="text-muted">
                    Set {s.setNumber}: <span className="font-medium text-foreground">{s.homeScore}–{s.awayScore}</span>
                  </li>
                ))}
              </ul>
            </div>
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

      {tournament.activity.usesMeetResults && meetResultGroups.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Results</h2>
          <MeetResultsView groups={meetResultGroups} />
        </section>
      )}

      {event.recap && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg font-bold">Recap</h2>
          <p className="recap whitespace-pre-wrap text-foreground">{event.recap}</p>
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
              <figure key={photo.id} className="overflow-hidden border border-border bg-white">
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
