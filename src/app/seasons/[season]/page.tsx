import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { sideLabel } from "@/lib/eventDisplay";
import { loadRoster } from "@/lib/tournamentRoster";
import { SchoolBadge } from "@/components/SchoolBadge";

export const dynamic = "force-dynamic";

// Everything the two headline cells below need, and nothing else - this page
// renders one upcoming event and one finished one, not a table.
const HEADLINE_EVENT = {
  id: true,
  slug: true,
  title: true,
  date: true,
  location: true,
  status: true,
  homeSourceOutcome: true,
  awaySourceOutcome: true,
  homeSourceEvent: { select: { externalId: true } },
  awaySourceEvent: { select: { externalId: true } },
  division: { select: { name: true } },
  participants: { select: { isHome: true, schoolId: true, school: { select: { name: true, code: true } } } },
  results: { select: { schoolId: true, score: true } },
} as const;

export default async function SeasonPage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: true, divisions: true, hostSchool: true },
  });
  if (!tournament) notFound();

  const now = new Date();
  const [roster, nextEvent, lastEvent] = await Promise.all([
    loadRoster(tournament.id),
    prisma.event.findFirst({
      where: { tournamentId: tournament.id, status: { not: "COMPLETED" }, date: { gte: now } },
      orderBy: [{ order: { sort: "asc", nulls: "last" } }, { date: "asc" }],
      select: HEADLINE_EVENT,
    }),
    prisma.event.findFirst({
      where: { tournamentId: tournament.id, status: "COMPLETED" },
      orderBy: { date: "desc" },
      select: HEADLINE_EVENT,
    }),
  ]);

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

      {(nextEvent || lastEvent) && (
        <div className="grid border-b-2 border-divider sm:grid-cols-2">
          <div className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
            {nextEvent ? (
              <NextCell event={nextEvent} tournamentSlug={tournament.slug} />
            ) : (
              <>
                <Eyebrow>Next up</Eyebrow>
                <p className="mt-3.5 text-sm text-muted">Every scheduled event has been played.</p>
              </>
            )}
          </div>
          <div className="p-7">
            {lastEvent ? (
              <LatestCell event={lastEvent} tournamentSlug={tournament.slug} />
            ) : (
              <>
                <Eyebrow>Latest result</Eyebrow>
                <p className="mt-3.5 text-sm text-muted">Results will appear here once play starts.</p>
              </>
            )}
          </div>
        </div>
      )}

      {roster.length > 0 && (
        <div className="border-b-2 border-divider bg-surface px-6 py-6 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <h6 className="text-primary-dark">Competing</h6>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              {roster.map((school) => (
                <li key={school.id} className="flex items-center gap-2 text-sm font-semibold">
                  <SchoolBadge
                    logoUrl={school.logoUrl}
                    name={school.name}
                    color={school.themeColor}
                    secondaryColor={school.themeColorSecondary}
                    size={28}
                  />
                  {school.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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

type HeadlineEvent = {
  id: string;
  slug: string;
  title: string | null;
  date: Date;
  location: string | null;
  homeSourceOutcome: "WINNER" | "LOSER" | null;
  awaySourceOutcome: "WINNER" | "LOSER" | null;
  homeSourceEvent: { externalId: string | null } | null;
  awaySourceEvent: { externalId: string | null } | null;
  division: { name: string } | null;
  participants: { isHome: boolean; schoolId: string; school: { name: string; code: string | null } }[];
  results: { schoolId: string; score: number | null }[];
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h6 className="text-primary-dark">{children}</h6>;
}

// A meet session has no home/away pair, so it's named by its title; a team
// game is named by its two sides, either of which may still be a playoff
// placeholder ("Winner of G3").
function matchupOf(event: HeadlineEvent) {
  if (event.participants.length === 0) return event.title ?? "Untitled session";
  const home = event.participants.find((p) => p.isHome);
  const away = event.participants.find((p) => !p.isHome);
  return `${sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)} v ${sideLabel(
    away,
    event.awaySourceOutcome,
    event.awaySourceEvent?.externalId
  )}`;
}

function NextCell({ event, tournamentSlug }: { event: HeadlineEvent; tournamentSlug: string }) {
  return (
    <div>
      <Eyebrow>Next up{event.division ? ` · ${event.division.name}` : ""}</Eyebrow>
      <div className="mt-3.5 text-5xl font-extrabold leading-[.9] tracking-tight tabular-nums">
        {format(event.date, "d MMM")}
      </div>
      <Link
        href={`/seasons/${tournamentSlug}/events/${event.slug}`}
        className="mt-3 inline-block text-[19px] font-extrabold hover:text-primary"
      >
        {matchupOf(event)}
      </Link>
      <p className="mt-3.5 text-xs text-muted">
        {format(event.date, "EEEE · h:mm a")}
        {event.location ? ` · ${event.location}` : ""}
      </p>
    </div>
  );
}

function LatestCell({ event, tournamentSlug }: { event: HeadlineEvent; tournamentSlug: string }) {
  const scored = event.participants
    .map((p) => ({ name: p.school.name, score: event.results.find((r) => r.schoolId === p.schoolId)?.score ?? null }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <div>
      <Eyebrow>Latest result{event.division ? ` · ${event.division.name}` : ""}</Eyebrow>
      {scored.length === 0 ? (
        <Link
          href={`/seasons/${tournamentSlug}/events/${event.slug}`}
          className="mt-3.5 inline-block text-3xl font-extrabold leading-tight hover:text-primary"
        >
          {event.title ?? "Untitled session"}
        </Link>
      ) : (
        scored.map((side, i) => (
          <div key={side.name}>
            <div className="mt-3.5 flex items-baseline justify-between gap-4">
              <span className={`text-[19px] font-extrabold ${i > 0 ? "text-muted" : ""}`}>{side.name}</span>
              <span
                className={`text-5xl font-extrabold leading-[.9] tracking-tight tabular-nums ${i > 0 ? "text-muted" : ""}`}
              >
                {side.score ?? "—"}
              </span>
            </div>
            {i === 0 && scored.length > 1 && <div className="mhr my-2.5" />}
          </div>
        ))
      )}
      <p className="mt-3.5 text-xs text-muted">
        {format(event.date, "EEE d MMM")}
        {" · "}
        <Link href={`/seasons/${tournamentSlug}/results`} className="text-primary-dark hover:underline">
          All results
        </Link>
      </p>
    </div>
  );
}
