import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SeasonBrowser } from "@/components/SeasonBrowser";
import { PhotoSlider } from "@/components/PhotoSlider";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";
import { dailyShuffle } from "@/lib/dailyShuffle";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();

  const [tournamentCount, schools, currentTournaments, seasons] = await Promise.all([
    prisma.tournament.count(),
    prisma.school.findMany(),
    prisma.tournament.findMany({ where: { isCurrent: true }, include: { activity: true } }),
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
  ]);
  const countries = new Set(schools.map((s) => s.city?.split(",").pop()?.trim()).filter(Boolean)).size;
  const currentTerm = currentTournaments[0]?.name ?? "this term";
  const shuffledSchools = dailyShuffle(schools);

  const [recentResults, upcomingTournaments, featuredPhotos, recentPhotos, recentRecap] = await Promise.all([
    // Site-wide, not scoped to isCurrent tournaments - isCurrent only picks
    // which edition an activity page defaults to, and can legitimately be
    // wrong or unset for a while, which would otherwise make this look
    // empty even with real completed games on the schedule.
    prisma.event.findMany({
      where: { status: "COMPLETED" },
      orderBy: { date: "desc" },
      take: 4,
      include: {
        participants: { include: { school: true } },
        results: true,
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

  const seasonCards = seasons.map((s) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    activities: s.activities.map((a) => ({
      id: a.id,
      name: a.name,
      href: a.tournaments[0] ? `/seasons/${a.tournaments[0].slug}` : `/tournaments/${a.slug}`,
    })),
  }));

  const scoreCells = recentResults.slice(0, 2);
  const nextUp = upcomingTournaments[0];
  // Admin-picked photos always win over recency - the newest-photos pool
  // only fills the slider until an admin has actually chosen anything.
  const homePhotos = featuredPhotos.length > 0 ? featuredPhotos : recentPhotos;

  return (
    <div>
      {/* Poster hero */}
      <div className="relative overflow-hidden bg-primary px-6 pb-10 pt-20 text-background sm:px-10 sm:pt-24">
        <div className="lattice-band absolute inset-x-0 top-0 h-[72px] border-b-2 border-accent/70 text-accent opacity-50" />
        <div className="relative mx-auto grid max-w-6xl gap-10 sm:grid-cols-[1.35fr_1fr] sm:items-end">
          <div>
            <h6 className="text-background opacity-85">
              Six schools · {tournamentCount} tournaments · {currentTerm}
            </h6>
            <div className="mt-4 text-6xl font-extrabold leading-[.9] tracking-[-.045em] text-accent sm:text-8xl">
              Play the
              <br />
              region.
            </div>
            <p className="mt-4 max-w-[46ch] text-base">MESAC is what our student-athletes plan their year around.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/tournaments" className="btn" style={{ background: "var(--accent)", color: "var(--primary-deep)" }}>
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
                const [a, b] = event.results;
                return (
                  <div key={event.id} className="flex items-baseline justify-between gap-3 border-b border-divider py-2.5 last:border-0">
                    <span className="text-[13px]">
                      <b>{event.participants[0]?.school.code || event.participants[0]?.school.name}</b> v{" "}
                      {event.participants[1]?.school.code || event.participants[1]?.school.name}
                      <br />
                      <span className="text-[11.5px] text-muted">{event.tournament.activity.name}</span>
                    </span>
                    <span className="text-2xl font-extrabold tracking-tight tabular-nums">
                      {a?.score ?? "–"}–{b?.score ?? "–"}
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

        <div className="relative mx-auto mt-10 grid max-w-6xl grid-cols-3 gap-3 border-t border-white/15 pt-6 sm:grid-cols-6">
          {shuffledSchools.map((school) => (
            <div
              key={school.id}
              className="flex h-32 items-center justify-center border border-white/20 bg-[color-mix(in_srgb,var(--primary-tint)_16%,transparent)] border-b-[3px]"
              style={school.themeColor ? { borderBottomColor: school.themeColor } : undefined}
            >
              {school.logoUrl ? (
                <Image src={school.logoUrl} alt={school.name} width={210} height={96} className="max-h-24 w-auto object-contain" />
              ) : (
                <span className="text-[11px] font-bold tracking-[0.1em] text-background/60">
                  {school.code ?? school.name.slice(0, 3).toUpperCase()}
                </span>
              )}
            </div>
          ))}
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
      <div className="grid border-b-2 border-divider sm:grid-cols-3">
        {[0, 1].map((i) => {
          const event = scoreCells[i];
          return (
            <div key={i} className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
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
        <div className="relative overflow-hidden bg-foreground p-7 text-background">
          <div className="lattice-panel absolute inset-0 text-accent opacity-[.16]" />
          {nextUp ? (
            <div className="relative">
              <h6 className="text-accent opacity-90">Next up</h6>
              <div className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">{nextUp.activity.name}</div>
              <p className="mt-3 text-[13px] opacity-90">
                {format(nextUp.startDate, "MMM d")} – {format(nextUp.endDate, "MMM d")}
                {nextUp.hostSchool ? ` · Hosted by ${nextUp.hostSchool.name}` : ""}
              </p>
              <Link
                href={`/seasons/${nextUp.slug}`}
                className="btn btn-block mt-4 text-[13px]"
                style={{ background: "var(--accent)", color: "var(--primary-deep)" }}
              >
                Tournament details →
              </Link>
            </div>
          ) : (
            <p className="relative text-sm opacity-90">No upcoming events scheduled.</p>
          )}
        </div>
      </div>

      {/* Stat row */}
      <div className="grid border-b-2 border-divider bg-surface sm:grid-cols-3">
        <Stat value="6" label="Member schools" />
        <Stat value={String(tournamentCount)} label="Tournaments this year" />
        <Stat value={String(countries)} label="Countries" />
      </div>

      {/* Season browser + season calendar */}
      <div className="grid border-b-2 border-divider sm:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <SeasonBrowser seasons={seasonCards} />
        </div>
        <div className="p-7">
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

      {/* Photo */}
      <div className="relative min-h-[480px] border-b-2 border-divider">
        <PhotoSlider photos={homePhotos.map((p) => ({ id: p.id, url: p.url, altText: p.altText }))} />
      </div>

      {/* Footer duo */}
      <div className="grid sm:grid-cols-[1fr_1.6fr]">
        <div className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">From the schools</h6>
          {recentRecap ? (
            <>
              <h4 className="mb-1.5 mt-2.5">{recentRecap.tournament.activity.name}</h4>
              <p className="text-sm text-muted">{recentRecap.recap}</p>
            </>
          ) : (
            <p className="mt-2.5 text-sm text-muted">Recaps from recent games will show up here.</p>
          )}
        </div>
        <div className="p-7">
          <h6 className="text-primary-dark">Six schools</h6>
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
    <div className="border-b border-divider p-6 sm:border-b-0 sm:border-r-2 sm:border-divider [&:last-child]:border-r-0">
      <div className="text-5xl font-extrabold leading-none tracking-tight">{value}</div>
      <h6 className="mt-1 text-muted">{label}</h6>
    </div>
  );
}

type ResultEvent = {
  id: string;
  participants: { school: { name: string; code: string | null } }[];
  results: { score: number | null; outcome: string | null }[];
  date: Date;
  tournament: { activity: { name: string }; hostSchool: { name: string } | null };
};

function ScoreCell({ event }: { event: ResultEvent }) {
  const sorted = [...event.results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const names = event.participants.map((p) => p.school.name);
  return (
    <div>
      <h6 className="text-primary-dark">Final · {event.tournament.activity.name}</h6>
      {sorted.map((r, i) => (
        <div key={i}>
          <div className="mt-3.5 flex items-baseline justify-between">
            <span className={`text-[19px] font-extrabold ${i > 0 ? "text-muted" : ""}`}>{names[i] ?? "—"}</span>
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
  startDate: Date;
  endDate: Date;
  activity: { name: string };
  hostSchool: { name: string } | null;
};

function UpcomingTournamentCell({ tournament }: { tournament: UpcomingTournament }) {
  return (
    <div>
      <h6 className="text-primary-dark">Upcoming · {tournament.activity.name}</h6>
      <div className="mt-3.5 text-lg font-extrabold">
        {format(tournament.startDate, "MMM d")} – {format(tournament.endDate, "MMM d")}
      </div>
      <p className="mt-3.5 text-xs text-muted">{tournament.hostSchool ? `Hosted by ${tournament.hostSchool.name}` : "Host TBD"}</p>
    </div>
  );
}
