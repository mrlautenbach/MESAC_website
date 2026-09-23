import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { LATEST_FIRST } from "@/lib/eventOrder";
import { SeasonBrowser } from "@/components/SeasonBrowser";
import { PhotoSlider } from "@/components/PhotoSlider";
import { NextUpGallery } from "@/components/NextUpGallery";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { dailyShuffle } from "@/lib/dailyShuffle";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();

  // One wave, not two - nothing in the second half depended on the first, so
  // splitting them only doubled the round-trip latency of the busiest page.
  const [
    tournamentCount,
    schools,
    currentTournaments,
    seasons,
    recentResults,
    upcomingTournaments,
    featuredPhotos,
    recentPhotos,
    recentRecap,
  ] = await Promise.all([
    prisma.tournament.count(),
    // League members only - a guest school plays in a tournament without
    // being presented as part of the league.
    prisma.school.findMany({ where: { isLeagueMember: true } }),
    prisma.tournament.findMany({ where: { isCurrent: true }, select: { name: true } }),
    prisma.season.findMany({
      orderBy: { order: "asc" },
      include: {
        activities: {
          orderBy: { name: "asc" },
          // Latest non-archived tournament, not "isCurrent: true" - see the
          // matching comment in /tournaments and /schedule for why.
          include: { tournaments: { where: { archived: false }, orderBy: { startDate: "desc" }, take: 1 } },
        },
      },
    }),
    // Site-wide, not scoped to isCurrent tournaments - isCurrent only picks
    // which edition an activity page defaults to, and can legitimately be
    // wrong or unset for a while, which would otherwise make this look
    // empty even with real completed games on the schedule.
    prisma.event.findMany({
      // A meet-style session (no home/away pair) doesn't fit this score
      // ticker - it has its own results display, not a two-team score.
      where: { status: "COMPLETED", participants: { some: {} } },
      orderBy: LATEST_FIRST,
      take: 5,
      include: {
        participants: { include: { school: true } },
        results: true,
        division: { select: { name: true } },
        tournament: { include: { activity: true, hostSchool: true } },
      },
    }),
    // Upcoming tournaments (editions), not individual games - driven purely
    // by each tournament's own dates, so it doesn't depend on isCurrent
    // either, and surfaces what's coming up across every activity at once.
    prisma.tournament.findMany({
      where: { endDate: { gte: now } },
      orderBy: { startDate: "asc" },
      take: 3,
      include: { activity: true, hostSchool: true },
    }),
    prisma.photo.findMany({ where: { featuredOnHome: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.photo.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.event.findFirst({
      where: { recap: { not: null } },
      orderBy: { date: "desc" },
      include: { tournament: { include: { activity: true } } },
    }),
  ]);

  const countries = new Set(schools.map((s) => s.city?.split(",").pop()?.trim()).filter(Boolean)).size;
  const currentTerm = currentTournaments[0]?.name ?? "this term";
  const shuffledSchools = dailyShuffle(schools);

  // Just the activities that actually exist - no "coming soon" placeholders
  // for a planned-but-not-yet-created sport, since the roster-matching
  // logic that produced those was a repeated source of bugs.
  const seasonCards = seasons.map((s) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    activities: s.activities.map((a) => ({
      key: a.id,
      name: a.name,
      sport: a.sport,
      href: a.tournaments[0] ? `/seasons/${a.tournaments[0].slug}` : `/tournaments/${a.slug}`,
    })),
  }));

  const scoreCells = recentResults.slice(0, 2);
  const upcomingCards = upcomingTournaments.map((t) => ({
    slug: t.slug,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    hostSchoolName: t.hostSchool?.name ?? null,
  }));
  // Admin-picked photos always win over recency - the newest-photos pool
  // only fills the slider until an admin has actually chosen anything.
  const homePhotos = featuredPhotos.length > 0 ? featuredPhotos : recentPhotos;

  return (
    <div>
      {/* Poster hero */}
      <div className="relative overflow-hidden bg-primary pb-10 pt-20 text-background sm:pt-24">
        <div className="lattice-band absolute inset-x-0 top-0 h-[72px] border-b-2 border-accent/70 text-accent opacity-50" />
        <div className="page-wrap relative grid gap-10 sm:grid-cols-[1.35fr_1fr] sm:items-end">
          <div>
            <h6 className="text-background opacity-85">
              {schools.length} schools · {tournamentCount} tournaments
            </h6>
            <div className="mt-4 text-6xl font-extrabold leading-[.9] tracking-[-.045em] text-accent sm:text-8xl">
              Play the
              <br />
              region.
            </div>
            <p className="mt-4 max-w-[46ch] text-base">MESAC is what our student-athletes plan their year around.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/tournaments" className="btn btn-accent">
                Season calendar
              </Link>
            </div>
          </div>
          <div className="bg-background p-6 text-foreground">
            <h6 className="text-primary-dark">Latest results</h6>
            {recentResults.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Results will appear here once the season kicks off.</p>
            ) : (
              recentResults.map((event) => {
                const home = event.participants.find((p) => p.isHome);
                const away = event.participants.find((p) => !p.isHome);
                const homeScore = event.results.find((r) => r.schoolId === home?.school.id)?.score;
                const awayScore = event.results.find((r) => r.schoolId === away?.school.id)?.score;
                return (
                  <div key={event.id} className="flex items-baseline justify-between gap-3 border-b border-divider py-1.5 last:border-0">
                    <span className="text-[13px] leading-tight">
                      <b>{home?.school.code || home?.school.name}</b> v {away?.school.code || away?.school.name}
                      <br />
                      <span className="text-[11.5px] text-muted">
                        {event.division ? `${event.division.name} ` : ""}
                        {event.tournament.activity.name}
                      </span>
                    </span>
                    <span className="text-2xl font-extrabold tracking-tight tabular-nums">
                      {homeScore ?? "–"}–{awayScore ?? "–"}
                    </span>
                  </div>
                );
              })
            )}
            <Link href="/schedule" className="mt-3 inline-block text-[12.5px] text-primary-dark">
              All scores
            </Link>
          </div>
        </div>

        <div className="page-wrap relative mt-10">
          <div className="grid grid-cols-3 gap-3 border-t border-white/15 pt-6 sm:grid-cols-6">
            {shuffledSchools.map((school) => (
              <Link
                key={school.id}
                href="/schools"
                title={school.name}
                className="flex h-32 flex-col items-center justify-center gap-2 border border-white/20 border-b-[3px] bg-[color-mix(in_srgb,var(--primary-tint)_16%,transparent)] px-2 transition-colors hover:bg-[color-mix(in_srgb,var(--primary-tint)_26%,transparent)]"
                style={school.themeColor ? { borderBottomColor: school.themeColor } : undefined}
              >
                {school.logoUrl && (
                  <span className="flex h-16 w-16 items-center justify-center bg-white p-1.5">
                    <Image src={school.logoUrl} alt="" width={64} height={64} className="max-h-full w-auto object-contain" />
                  </span>
                )}
                <span className="text-[12px] font-bold tracking-[0.1em] text-background/85">
                  {school.code ?? school.name.slice(0, 3).toUpperCase()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Ticker */}
      <div className="overflow-hidden border-b-2 border-divider bg-foreground text-background">
        <div className="ticker-track">
          {[0, 1].map((i) => (
            <div key={i} className="flex text-[12.5px] tracking-[0.04em]">
              {recentResults.length === 0 ? (
                <span className="whitespace-nowrap border-r border-white/20 px-6 py-2.5">
                  <span className="mr-2.5 font-extrabold text-accent">●</span>
                  {currentTerm} is underway. Check back after the first whistle
                </span>
              ) : (
                recentResults.map((event, j) => (
                  <span key={j} className="whitespace-nowrap border-r border-white/20 px-6 py-2.5">
                    <span className="mr-2.5 font-extrabold text-accent">●</span>
                    {event.tournament.activity.sport.toUpperCase()} · {event.participants.map((p) => p.school.name).join(" v ")}{" "}
                    {event.results.map((r) => r.score).join("–")}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Three score cells */}
      <div className="border-b-2 border-divider">
      <div className="page-wrap grid sm:grid-cols-3">
        {[0, 1].map((i) => {
          const event = scoreCells[i];
          return (
            <div key={i} className="border-b border-divider py-7 sm:border-b-0 sm:border-r-2 sm:border-divider sm:pr-7 sm:[&:nth-child(2)]:pl-7">
              {event ? (
                <ScoreCell event={event} />
              ) : upcomingTournaments[i] ? (
                <UpcomingTournamentCell tournament={upcomingTournaments[i]} />
              ) : (
                <p className="text-sm text-muted">No games played yet.</p>
              )}
            </div>
          );
        })}
        <div className="relative my-4 overflow-hidden bg-foreground p-7 text-background sm:my-0 sm:ml-7">
          <div className="lattice-panel absolute inset-0 text-accent opacity-[.16]" />
          <NextUpGallery tournaments={upcomingCards} />
        </div>
      </div>
      </div>

      {/* Stat row */}
      <div className="border-b-2 border-divider bg-surface">
        <div className="page-wrap grid sm:grid-cols-3">
          <Stat value={String(schools.length)} label="Member schools" />
          <Stat value={String(tournamentCount)} label="Tournaments this year" />
          <Stat value={String(countries)} label="Countries" />
        </div>
      </div>

      {/* Season browser + season calendar */}
      <div className="border-b-2 border-divider">
      <div className="page-wrap grid sm:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-divider py-7 sm:border-b-0 sm:border-r-2 sm:border-divider sm:pr-7">
          <SeasonBrowser seasons={seasonCards} />
        </div>
        <div className="py-7 sm:pl-7">
          <h3 className="mb-2.5">Season calendar</h3>
          <p className="text-sm text-muted">Three seasons make up the MESAC year.</p>
          <div className="mhr" />
          {[1, 2, 3].map((order) => (
            <div key={order} className="flex justify-between border-b border-divider py-3 text-sm last:border-b-0">
              <span className="font-bold">Season {order}</span>
              <span className="text-muted">{SEASON_DATE_RANGES[order]}</span>
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* Photo - only once there's a real one to show */}
      {homePhotos.length > 0 && (
        <div className="relative min-h-[480px] border-b-2 border-divider">
          <PhotoSlider photos={homePhotos.map((p) => ({ id: p.id, url: p.url, altText: p.altText }))} />
        </div>
      )}

      {/* Footer duo */}
      <div className="page-wrap grid sm:grid-cols-[1fr_1.6fr]">
        <div className="border-b border-divider py-7 sm:border-b-0 sm:border-r-2 sm:border-divider sm:pr-7">
          <h6 className="text-primary-dark">From the schools</h6>
          {recentRecap ? (
            <>
              <h4 className="mb-1.5 mt-2.5">{recentRecap.tournament.activity.name}</h4>
              <p className="recap">{recentRecap.recap}</p>
            </>
          ) : (
            <p className="mt-2.5 text-sm text-muted">Recaps from recent games will show up here.</p>
          )}
        </div>
        <div className="py-7 sm:pl-7">
          <h6 className="text-primary-dark">Member schools</h6>
          <p className="mt-2.5 text-sm leading-[1.9] text-muted">
            {shuffledSchools.map((s) => s.name).join(" · ")}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-b border-divider py-6 sm:border-b-0 sm:border-r-2 sm:border-divider sm:px-6 sm:first:pl-0 [&:last-child]:border-r-0">
      <div className="text-5xl font-extrabold leading-none tracking-tight">{value}</div>
      <h6 className="mt-1 text-muted">{label}</h6>
    </div>
  );
}

type ResultEvent = {
  id: string;
  participants: { isHome: boolean; school: { id: string; name: string; code: string | null } }[];
  results: { schoolId: string; score: number | null; outcome: string | null }[];
  date: Date;
  division: { name: string } | null;
  tournament: { activity: { name: string }; hostSchool: { name: string } | null };
};

function ScoreCell({ event }: { event: ResultEvent }) {
  const pairs = event.participants.map((p) => ({
    name: p.school.name,
    score: event.results.find((r) => r.schoolId === p.school.id)?.score ?? null,
  }));
  const sorted = [...pairs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <div>
      <h6 className="text-primary-dark">
        Final · {event.division ? `${event.division.name} ` : ""}
        {event.tournament.activity.name}
      </h6>
      {sorted.map((r, i) => (
        <div key={i}>
          <div className="mt-3.5 flex items-baseline justify-between">
            <span className={`text-[19px] font-extrabold ${i > 0 ? "text-muted" : ""}`}>{r.name ?? "—"}</span>
            <span className={`text-6xl font-extrabold leading-[.9] tracking-tight tabular-nums ${i > 0 ? "text-muted" : ""}`}>
              {r.score ?? "—"}
            </span>
          </div>
          {i === 0 && <div className="mhr my-2.5" />}
        </div>
      ))}
      <p className="mt-3.5 text-xs text-muted">
        {format(event.date, "EEE d MMM")}
        {event.tournament.hostSchool ? ` · Hosted by ${event.tournament.hostSchool.name}` : ""}
      </p>
    </div>
  );
}

type UpcomingTournament = {
  slug: string;
  name: string;
  startDate: Date;
  endDate: Date;
  hostSchool: { name: string } | null;
};

function UpcomingTournamentCell({ tournament }: { tournament: UpcomingTournament }) {
  return (
    <div>
      <h6 className="text-primary-dark">Upcoming · {tournament.name}</h6>
      <div className="mt-3.5 text-lg font-extrabold">
        {format(tournament.startDate, "MMM d")} – {format(tournament.endDate, "MMM d")}
      </div>
      <p className="mt-3.5 text-xs text-muted">{tournament.hostSchool ? `Hosted by ${tournament.hostSchool.name}` : "Host TBD"}</p>
    </div>
  );
}
