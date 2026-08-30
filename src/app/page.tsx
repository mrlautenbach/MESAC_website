import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { computeStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();

  const [tournamentCount, schools, currentSeasons] = await Promise.all([
    prisma.tournament.count(),
    prisma.school.findMany(),
    prisma.season.findMany({ where: { isCurrent: true }, include: { tournament: true } }),
  ]);
  const currentSeasonIds = currentSeasons.map((s) => s.id);
  const countries = new Set(schools.map((s) => s.city?.split(",").pop()?.trim()).filter(Boolean)).size;
  const currentTerm = currentSeasons[0]?.name ?? "this season";

  const [recentResults, upcomingEvents, recentPhoto, recentRecap] = await Promise.all([
    currentSeasonIds.length
      ? prisma.event.findMany({
          where: { seasonId: { in: currentSeasonIds }, status: "COMPLETED" },
          orderBy: { date: "desc" },
          take: 4,
          include: { participants: { include: { school: true } }, results: true, season: { include: { tournament: true } } },
        })
      : [],
    currentSeasonIds.length
      ? prisma.event.findMany({
          where: { seasonId: { in: currentSeasonIds }, date: { gte: now }, status: { not: "CANCELLED" } },
          orderBy: { date: "asc" },
          take: 6,
          include: { participants: { include: { school: true } }, season: { include: { tournament: true } }, division: true },
        })
      : [],
    prisma.photo.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.event.findFirst({
      where: { recap: { not: null } },
      orderBy: { date: "desc" },
      include: { season: { include: { tournament: true } } },
    }),
  ]);

  // Feature the WIN_LOSS tournament with the most recently updated result.
  const featuredTournamentSeasonId = await (async () => {
    if (!currentSeasonIds.length) return null;
    const lastResult = await prisma.result.findFirst({
      where: { event: { seasonId: { in: currentSeasonIds }, season: { tournament: { scoringType: "WIN_LOSS" } } }, outcome: { not: null } },
      orderBy: { updatedAt: "desc" },
      include: { event: { include: { season: { include: { tournament: true } } } } },
    });
    return lastResult?.event.season ?? null;
  })();
  const featuredStandings = featuredTournamentSeasonId ? (await computeStandings(featuredTournamentSeasonId.id)).slice(0, 5) : [];

  const scoreCells = recentResults.slice(0, 2);
  const nextUp = upcomingEvents[0];
  const weekendEvents = upcomingEvents.slice(0, 6);

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
              whole
              <br />
              region.
            </div>
            <p className="mt-4 max-w-[46ch] text-base">
              From Muscat to New Delhi, MESAC is the season our student athletes plan their year around — and the
              weekends their families travel for.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/schedule" className="btn" style={{ background: "var(--accent)", color: "var(--primary-deep)" }}>
                This weekend&apos;s fixtures →
              </Link>
              <Link href="/tournaments" className="btn btn-secondary" style={{ color: "var(--background)", borderColor: "color-mix(in srgb, var(--accent) 75%, transparent)" }}>
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
                      <b>{event.participants[0]?.school.name}</b> v {event.participants[1]?.school.name}
                      <br />
                      <span className="text-[11.5px] text-muted">{event.season.tournament.name}</span>
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
      </div>

      {/* Ticker */}
      <div className="overflow-hidden border-b-2 border-divider bg-foreground text-background">
        <div className="ticker-track">
          {[0, 1].map((i) => (
            <div key={i} className="flex text-[12.5px] tracking-[0.04em]">
              {recentResults.length === 0 ? (
                <span className="whitespace-nowrap border-r border-white/20 px-6 py-2.5">
                  <span className="mr-2.5 font-extrabold text-accent">●</span>Season {currentTerm} is underway — check
                  back after the first whistle
                </span>
              ) : (
                recentResults.map((event, j) => (
                  <span key={j} className="whitespace-nowrap border-r border-white/20 px-6 py-2.5">
                    <span className="mr-2.5 font-extrabold text-accent">●</span>
                    {event.season.tournament.sport.toUpperCase()} · {event.participants.map((p) => p.school.name).join(" v ")}{" "}
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
              ) : upcomingEvents[i] ? (
                <UpcomingCell event={upcomingEvents[i]} />
              ) : (
                <p className="text-sm text-muted">No games played yet.</p>
              )}
            </div>
          );
        })}
        <div className="lattice-panel relative overflow-hidden bg-foreground p-7 text-background">
          <div className="absolute inset-0 text-accent opacity-[.26]" />
          {nextUp ? (
            <div className="relative">
              <h6 className="text-accent opacity-90">Next up</h6>
              <div className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">{nextUp.season.tournament.name}</div>
              <p className="mt-3 text-[13px] opacity-90">
                {nextUp.participants.map((p) => p.school.name).join(" vs ")} · {format(nextUp.date, "EEE d MMM, h:mm a")}
                {nextUp.location ? ` · ${nextUp.location}` : ""}
              </p>
              <Link
                href={`/seasons/${nextUp.season.slug}/events/${nextUp.slug}`}
                className="btn btn-block mt-4 text-[13px]"
                style={{ background: "var(--accent)", color: "var(--primary-deep)" }}
              >
                Event details →
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
        <Stat value={String(countries)} label="Countries, one bus manifest" />
      </div>

      {/* Weekend + standings */}
      <div className="grid border-b-2 border-divider sm:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <div className="mb-3 flex items-baseline justify-between">
            <h4>This weekend</h4>
            <Link href="/schedule" className="text-[12.5px] text-primary-dark">
              Full schedule
            </Link>
          </div>
          {weekendEvents.length === 0 ? (
            <p className="text-sm text-muted">No upcoming events scheduled.</p>
          ) : (
            <table className="mtable">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Sport</th>
                  <th>Fixture</th>
                  <th className="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {weekendEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="font-extrabold">{format(e.date, "EEE")}</td>
                    <td>
                      {e.season.tournament.sport}
                      {e.division ? ` (${e.division.name})` : ""}
                    </td>
                    <td>{e.participants.map((p) => p.school.name).join(" v ")}</td>
                    <td className="text-right tabular-nums">{format(e.date, "d MMM, HH:mm")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="p-7">
          <div className="mb-3 flex items-baseline justify-between">
            <h4>{featuredTournamentSeasonId ? `${featuredTournamentSeasonId.tournament.name} table` : "Standings"}</h4>
            <Link href="/tournaments" className="text-[12.5px] text-primary-dark">
              All standings
            </Link>
          </div>
          {featuredStandings.length === 0 ? (
            <p className="text-sm text-muted">Standings will appear here once results are posted.</p>
          ) : (
            <table className="mtable">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>School</th>
                  <th className="text-right">P</th>
                  <th className="text-right">W</th>
                  <th className="text-right">L</th>
                  <th className="text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {featuredStandings.map((row, i) => (
                  <tr key={row.schoolId}>
                    <td className="font-extrabold text-primary-dark">{i + 1}</td>
                    <td className="font-bold">{row.schoolName}</td>
                    <td className="text-right tabular-nums">{row.played}</td>
                    <td className="text-right tabular-nums">{row.wins}</td>
                    <td className="text-right tabular-nums">{row.losses}</td>
                    <td className="text-right font-extrabold tabular-nums">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Photo + event links */}
      <div className="grid border-b-2 border-divider sm:grid-cols-[1.25fr_1fr]">
        <div className="relative min-h-[300px] border-b border-divider sm:border-b-0 sm:border-r-2 sm:border-divider">
          {recentPhoto ? (
            <Image src={recentPhoto.url} alt={recentPhoto.altText ?? ""} fill className="object-cover grayscale contrast-[1.08]" />
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center bg-foreground/10">
              <span className="px-4 text-center text-xs tracking-[0.12em] text-muted">PHOTOGRAPH · B&amp;W</span>
            </div>
          )}
        </div>
        <div className="p-8">
          <h3 className="mb-2.5">The season, in one page</h3>
          <p className="text-sm text-muted">Every tournament&apos;s dates, host, schedule, and results — one link per sport.</p>
          <div className="mhr" />
          {currentSeasons.slice(0, 4).map((s) => (
            <Link
              key={s.id}
              href={`/seasons/${s.slug}`}
              className="flex justify-between border-b border-divider py-3 text-sm last:border-0"
            >
              {s.tournament.name} · {s.name}
              <span className="text-primary">→</span>
            </Link>
          ))}
          {currentSeasons.length === 0 && <p className="text-sm text-muted">No seasons yet.</p>}
        </div>
      </div>

      {/* Footer trio */}
      <div className="grid sm:grid-cols-3">
        <div className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">From the schools</h6>
          {recentRecap ? (
            <>
              <h4 className="mb-1.5 mt-2.5">{recentRecap.season.tournament.name}</h4>
              <p className="text-sm text-muted">{recentRecap.recap}</p>
            </>
          ) : (
            <p className="mt-2.5 text-sm text-muted">Recaps from recent games will show up here.</p>
          )}
        </div>
        <div className="border-b border-divider p-7 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">For families</h6>
          <h4 className="mb-1.5 mt-2.5">New to a MESAC weekend?</h4>
          <p className="text-sm text-muted">
            Host billeting, dates, and travel details for each tournament live on that tournament&apos;s season page.
          </p>
        </div>
        <div className="p-7">
          <h6 className="text-primary-dark">Six schools</h6>
          <p className="mt-2.5 text-sm leading-[1.9] text-muted">
            {schools.map((s) => s.name).join(" · ")}
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
  participants: { school: { name: string } }[];
  results: { score: number | null; outcome: string | null }[];
  location: string | null;
  date: Date;
  season: { tournament: { name: string } };
};

function ScoreCell({ event }: { event: ResultEvent }) {
  const sorted = [...event.results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const names = event.participants.map((p) => p.school.name);
  return (
    <div>
      <h6 className="text-primary-dark">Final · {event.season.tournament.name}</h6>
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
        {event.location ? ` · ${event.location}` : ""}
      </p>
    </div>
  );
}

type UpcomingEvent = {
  participants: { school: { name: string } }[];
  date: Date;
  location: string | null;
  season: { tournament: { name: string } };
};

function UpcomingCell({ event }: { event: UpcomingEvent }) {
  return (
    <div>
      <h6 className="text-primary-dark">Upcoming · {event.season.tournament.name}</h6>
      <div className="mt-3.5 text-lg font-extrabold">{event.participants.map((p) => p.school.name).join(" vs ")}</div>
      <p className="mt-3.5 text-xs text-muted">
        {format(event.date, "EEE d MMM, h:mm a")}
        {event.location ? ` · ${event.location}` : ""}
      </p>
    </div>
  );
}
