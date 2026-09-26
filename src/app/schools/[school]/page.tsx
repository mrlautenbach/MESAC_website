import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SchoolBadge } from "@/components/SchoolBadge";
import { SportIcon } from "@/components/icons/SportIcon";
import { formatWhen, sideLabel } from "@/lib/eventDisplay";
import { dayBounds, formatDateRange, formatShortDay, leagueToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ school: string }> }) {
  const { school: slug } = await params;
  const school = await prisma.school.findUnique({ where: { slug }, select: { name: true } });
  return { title: school?.name ?? "School" };
}

const GAME_INCLUDE = {
  tournament: { include: { activity: true } },
  division: true,
  participants: { include: { school: true } },
  results: true,
  homeSourceEvent: { select: { externalId: true } },
  awaySourceEvent: { select: { externalId: true } },
} as const;

// One school's page: its games coming up and its latest results across
// every sport, the tournaments it's in this year, and its team photos.
export default async function SchoolPage({ params }: { params: Promise<{ school: string }> }) {
  const { school: slug } = await params;
  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) notFound();

  const todayStart = dayBounds(leagueToday()).gte;
  const playing = { participants: { some: { schoolId: school.id } } };
  const [upcoming, recent, entries, teamPhotos] = await Promise.all([
    prisma.event.findMany({
      where: { ...playing, status: "SCHEDULED", date: { gte: todayStart } },
      orderBy: { date: "asc" },
      take: 10,
      include: GAME_INCLUDE,
    }),
    prisma.event.findMany({ where: { ...playing, status: "COMPLETED" }, orderBy: { date: "desc" }, take: 10, include: GAME_INCLUDE }),
    prisma.tournamentSchool.findMany({
      where: { schoolId: school.id, participating: true, tournament: { archived: false, endDate: { gte: todayStart } } },
      include: { tournament: { include: { activity: true, hostSchool: true } } },
      orderBy: { tournament: { startDate: "asc" } },
    }),
    prisma.teamPhoto.findMany({
      where: { schoolId: school.id, enabled: true, photoUrl: { not: null }, tournament: { isCurrent: true } },
      include: { tournament: { include: { activity: true } }, division: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  type Game = (typeof upcoming)[number];
  // This school's side of a game, the opponent's, and - once it's played -
  // its result from this school's point of view.
  const view = (game: Game) => {
    const own = game.participants.find((p) => p.schoolId === school.id);
    const other = game.participants.find((p) => p.schoolId !== school.id);
    const otherIsHome = !own?.isHome;
    const opponent = other
      ? other.school
      : {
          name: sideLabel(
            null,
            otherIsHome ? game.homeSourceOutcome : game.awaySourceOutcome,
            (otherIsHome ? game.homeSourceEvent : game.awaySourceEvent)?.externalId,
            otherIsHome ? game.homeSourceStanding : game.awaySourceStanding,
            otherIsHome ? game.homeSourceLabel : game.awaySourceLabel
          ),
          code: null,
          logoUrl: null,
          themeColor: null,
          themeColorSecondary: null,
        };
    const ownResult = game.results.find((r) => r.schoolId === school.id);
    const otherResult = other ? game.results.find((r) => r.schoolId === other.schoolId) : undefined;
    const lowWins = game.tournament.activity.scoringType === "LOW_SCORE";
    let outcome = ownResult?.outcome ?? null;
    if (!outcome && ownResult?.score != null && otherResult?.score != null) {
      const [mine, theirs] = [ownResult.score, otherResult.score];
      outcome = mine === theirs ? "DRAW" : mine > theirs !== lowWins ? "WIN" : "LOSS";
    }
    return { opponent, isHome: !!own?.isHome, outcome, score: ownResult?.score ?? null, otherScore: otherResult?.score ?? null };
  };
  const record = recent.map(view).reduce(
    (tally, g) => ({ ...tally, [g.outcome ?? "none"]: (tally[g.outcome ?? "none"] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  const GameRow = ({ game, played }: { game: Game; played: boolean }) => {
    const g = view(game);
    return (
      <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 sm:grid-cols-[5.5rem_minmax(0,11rem)_minmax(0,1fr)_auto]">
        <span className="text-sm text-muted tabular-nums">{formatShortDay(game.date)}</span>
        <span className="hidden min-w-0 items-center gap-1.5 truncate text-sm text-muted sm:flex">
          <SportIcon sport={game.tournament.activity.sport} size={16} />
          <span className="truncate">
            {game.division ? `${game.division.name} ` : ""}
            {game.tournament.activity.name}
          </span>
        </span>
        <Link href={`/seasons/${game.tournament.slug}/events/${game.slug}`} className="flex min-w-0 items-center gap-1.5 font-semibold hover:text-primary">
          <span className="text-muted">{g.isHome ? "v" : "at"}</span>
          <SchoolBadge size={22} logoUrl={g.opponent.logoUrl} name={g.opponent.name} color={g.opponent.themeColor} secondaryColor={g.opponent.themeColorSecondary} />
          <span className="truncate">{g.opponent.name}</span>
        </Link>
        <span className="text-right text-sm tabular-nums">
          {played ? (
            <>
              {g.outcome && (
                <span className={`mr-1.5 font-extrabold ${g.outcome === "WIN" ? "text-success" : g.outcome === "LOSS" ? "text-danger" : "text-muted"}`}>
                  {g.outcome === "WIN" ? "W" : g.outcome === "LOSS" ? "L" : "D"}
                </span>
              )}
              {g.score != null && g.otherScore != null ? `${g.score}–${g.otherScore}` : ""}
            </>
          ) : (
            <span className="text-muted">{formatWhen(game.date, "h:mm a") || "TBC"}</span>
          )}
        </span>
      </li>
    );
  };

  return (
    <div>
      <div className="relative overflow-hidden bg-ink py-8 text-on-ink sm:py-10">
        <div className="lattice-panel absolute inset-0 text-accent opacity-[.16]" />
        <div className="page-wrap relative">
          <Link href="/schools" className="text-sm font-semibold text-accent hover:underline">
            &larr; Schools
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {school.logoUrl && (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center bg-white p-2 sm:h-24 sm:w-24">
                <Image src={school.logoUrl} alt="" width={96} height={96} className="max-h-full w-auto object-contain" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-[0.12em] text-accent uppercase">
                {[school.code, school.city].filter(Boolean).join(" · ")}
                {!school.isLeagueMember && " · Guest school"}
              </p>
              <h1 className="mt-1 text-3xl leading-tight sm:text-5xl">{school.name}</h1>
            </div>
          </div>
          {school.themeColor && (
            <div className="mt-5 flex h-1.5 w-40">
              <span className="flex-1" style={{ background: school.themeColor }} />
              {school.themeColorSecondary && <span className="flex-1" style={{ background: school.themeColorSecondary }} />}
            </div>
          )}
        </div>
      </div>

      <div className="page-wrap grid gap-10 py-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          <section>
            <h2 className="mb-2 text-xl">Coming up</h2>
            {upcoming.length === 0 ? (
              <p className="text-muted">No games scheduled right now.</p>
            ) : (
              <ul className="divide-y divide-divider border-y border-divider">
                {upcoming.map((game) => (
                  <GameRow key={game.id} game={game} played={false} />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl">Latest results</h2>
              {recent.length > 0 && (
                <span className="text-sm text-muted tabular-nums">
                  Last {recent.length}: {record.WIN ?? 0} W · {record.LOSS ?? 0} L{record.DRAW ? ` · ${record.DRAW} D` : ""}
                </span>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="text-muted">No results yet.</p>
            ) : (
              <ul className="divide-y divide-divider border-y border-divider">
                {recent.map((game) => (
                  <GameRow key={game.id} game={game} played />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-10">
          <section>
            <h2 className="mb-2 text-xl">Tournaments</h2>
            {entries.length === 0 ? (
              <p className="text-muted">Not entered in an upcoming tournament yet.</p>
            ) : (
              <ul className="divide-y divide-divider border-y border-divider">
                {entries.map(({ tournament }) => (
                  <li key={tournament.id}>
                    <Link href={`/seasons/${tournament.slug}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                      <SportIcon sport={tournament.activity.sport} size={18} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{tournament.activity.name}</span>
                        <span className="block text-sm text-muted">
                          {formatDateRange(tournament.startDate, tournament.endDate)}
                          {tournament.hostSchool && ` · ${tournament.hostSchool.id === school.id ? "Hosting" : `at ${tournament.hostSchool.code || tournament.hostSchool.name}`}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {teamPhotos.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl">Team photos</h2>
              <div className="grid grid-cols-2 gap-3">
                {teamPhotos.map((photo) => (
                  <Link key={photo.id} href={`/seasons/${photo.tournament.slug}/team-photos`} className="group block">
                    <span className="relative block aspect-[4/3] overflow-hidden border border-border bg-surface">
                      <Image
                        src={photo.photoUrl!}
                        alt={`${school.name} ${photo.division ? `${photo.division.name} ` : ""}${photo.tournament.activity.name} team`}
                        fill
                        sizes="(max-width: 1024px) 50vw, 20vw"
                        className="object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {photo.division ? `${photo.division.name} ` : ""}
                      {photo.tournament.activity.name} · {format(photo.tournament.startDate, "yyyy")}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
