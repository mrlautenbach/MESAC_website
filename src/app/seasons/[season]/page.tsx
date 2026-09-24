import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { LATEST_FIRST, SCHEDULE_ORDER } from "@/lib/eventOrder";
import { SeasonHero } from "@/components/SeasonHero";
import { TournamentSubNav } from "@/components/TournamentSubNav";
import { GolfOverview } from "@/components/GolfViews";
import { LiveIcon } from "@/components/icons/LiveIcon";
import { sideLabel } from "@/lib/eventDisplay";
import { loadRoster } from "@/lib/tournamentRoster";
import { SchoolBadge } from "@/components/SchoolBadge";
import { UpcomingGames } from "@/components/TournamentGames";

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
  homeSourceStanding: true,
  awaySourceStanding: true,
  homeSourceLabel: true,
  awaySourceLabel: true,
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
      orderBy: SCHEDULE_ORDER,
      select: HEADLINE_EVENT,
    }),
    prisma.event.findFirst({
      where: { tournamentId: tournament.id, status: "COMPLETED" },
      orderBy: LATEST_FIRST,
      select: HEADLINE_EVENT,
    }),
  ]);

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
      />

      {(nextEvent || lastEvent) && (
        <div className="border-b-2 border-divider">
        <div className="page-wrap grid sm:grid-cols-2">
          <div className="border-b border-divider py-7 sm:border-b-0 sm:border-r-2 sm:border-divider sm:pr-7">
            {nextEvent ? (
              <NextCell event={nextEvent} tournamentSlug={tournament.slug} />
            ) : (
              <>
                <Eyebrow>Next up</Eyebrow>
                <p className="mt-3.5 text-sm text-muted">Every scheduled event has been played.</p>
              </>
            )}
          </div>
          <div className="py-7 sm:pl-7">
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
        </div>
      )}

      {tournament.activity.usesLiveResults && <LiveResultsBand tournament={tournament} />}

      {tournament.activity.usesGolfFormat ? (
        <div className="page-wrap py-8">
          <GolfOverview tournamentId={tournament.id} tournamentSlug={tournament.slug} scoring={tournament.activity} />
        </div>
      ) : (
        !tournament.activity.usesMeetResults && (
          <div className="page-wrap py-8">
            <h4 className="mb-3">Coming up</h4>
            <UpcomingGames tournamentId={tournament.id} tournamentSlug={tournament.slug} activity={tournament.activity} />
          </div>
        )
      )}
      {roster.length > 0 && (
        <div className="border-b-2 border-divider bg-surface py-6">
          <div className="page-wrap">
            <h6 className="text-primary-dark">Competing</h6>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
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
  homeSourceStanding: number | null;
  awaySourceStanding: number | null;
  homeSourceLabel: string | null;
  awaySourceLabel: string | null;
  homeSourceEvent: { externalId: string | null } | null;
  awaySourceEvent: { externalId: string | null } | null;
  division: { name: string } | null;
  participants: { isHome: boolean; schoolId: string; school: { name: string; code: string | null } }[];
  results: { schoolId: string; score: number | null }[];
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h6 className="text-primary-dark">{children}</h6>;
}

type LiveResultsTournament = {
  liveResultsUrl: string | null;
  liveResultsText: string | null;
  liveResultsPhotoUrl: string | null;
};

// A meet's live results aren't always a hosted website - often it's a photo
// of a printed sheet, or a few pasted lines. Whichever the admin set, shown
// in one place: a photo first (richest), then text, then the link.
function LiveResultsBand({ tournament }: { tournament: LiveResultsTournament }) {
  const { liveResultsUrl, liveResultsText, liveResultsPhotoUrl } = tournament;
  if (!liveResultsUrl && !liveResultsText && !liveResultsPhotoUrl) return null;

  return (
    <div className="border-b-2 border-divider bg-surface py-6">
      <div className="page-wrap">
        <Eyebrow>
          <span className="inline-flex items-center gap-1.5">
            <LiveIcon />
            Live results
          </span>
        </Eyebrow>
        {liveResultsPhotoUrl ? (
          <a href={liveResultsPhotoUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block">
            <div className="relative h-[28rem] max-w-md border border-divider bg-background">
              <Image src={liveResultsPhotoUrl} alt="Live results" fill sizes="448px" className="object-contain" />
            </div>
          </a>
        ) : liveResultsText ? (
          <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed">{liveResultsText}</p>
        ) : (
          <a href={liveResultsUrl!} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-3 inline-block">
            Open live results ↗
          </a>
        )}
      </div>
    </div>
  );
}

// A meet session has no home/away pair, so it's named by its title; a team
// game is named by its two sides, either of which may still be a playoff
// placeholder ("Winner of G3").
function matchupOf(event: HeadlineEvent) {
  // A meet session never sets any of these; a team game does, even before
  // either side has a concrete school (e.g. both sides still pending).
  const isDualMatchup =
    event.participants.length > 0 ||
    event.homeSourceOutcome ||
    event.awaySourceOutcome ||
    event.homeSourceStanding ||
    event.awaySourceStanding ||
    event.homeSourceLabel ||
    event.awaySourceLabel;
  if (!isDualMatchup) return event.title ?? "Untitled session";
  const home = event.participants.find((p) => p.isHome);
  const away = event.participants.find((p) => !p.isHome);
  return `${sideLabel(
    home,
    event.homeSourceOutcome,
    event.homeSourceEvent?.externalId,
    event.homeSourceStanding,
    event.homeSourceLabel
  )} v ${sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId, event.awaySourceStanding, event.awaySourceLabel)}`;
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
