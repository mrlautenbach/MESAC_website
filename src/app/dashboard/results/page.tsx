import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { EARLIEST_FIRST } from "@/lib/eventOrder";
import { getCurrentUser } from "@/lib/session";
import { sideLabel } from "@/lib/eventDisplay";
import { formatGolfPoints, matchScore } from "@/lib/golf";

// Everything needed to group events by tournament and show a quick
// needs-result/entered badge per row - same shape as the dashboard's own
// EVENT_ROW, plus the activity's usesMeetResults flag to tell a meet
// session (no participants, results entered via CSV import) apart from a
// dual-matchup game (results entered via the score form).
const RESULT_EVENT_ROW = {
  id: true,
  slug: true,
  date: true,
  location: true,
  status: true,
  title: true,
  homeSourceOutcome: true,
  awaySourceOutcome: true,
  homeSourceStanding: true,
  awaySourceStanding: true,
  homeSourceLabel: true,
  awaySourceLabel: true,
  homeSourceEvent: { select: { externalId: true } },
  awaySourceEvent: { select: { externalId: true } },
  division: { select: { name: true } },
  tournament: {
    select: { id: true, name: true, slug: true, activity: { select: { id: true, name: true, usesMeetResults: true } } },
  },
  participants: { select: { isHome: true, school: { select: { name: true } } } },
} as const;

type ResultEvent = Prisma.EventGetPayload<{ select: typeof RESULT_EVENT_ROW }>;

export default async function ResultsDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Same visibility rule as the main dashboard: an admin sees every current
  // tournament, a school editor only the games their own school is in. Meet
  // sessions have no participants, so this filter naturally leaves them out
  // for a school editor too - only admins can enter meet results anyway (see
  // importMeetResultsAction).
  const scope = user.role === "ADMIN" ? {} : { participants: { some: { schoolId: user.schoolId ?? "" } } };

  const [events, golfTournaments] = await Promise.all([
    prisma.event.findMany({
      where: { ...scope, tournament: { isCurrent: true } },
      orderBy: EARLIEST_FIRST,
      select: RESULT_EVENT_ROW,
    }),
    // Golf's results live in their own tables (Day 1 scores, team matches),
    // not in events, and only admins enter them.
    user.role === "ADMIN"
      ? prisma.tournament.findMany({
          where: { isCurrent: true, activity: { usesGolfFormat: true } },
          include: {
            activity: true,
            golfGroups: { orderBy: { number: "asc" }, include: { players: { select: { points: true } } } },
            golfMatches: {
              orderBy: [{ round: "asc" }, { startTime: "asc" }],
              include: { homeSchool: true, awaySchool: true, pairs: { select: { winner: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const tournamentOrder: string[] = [];
  const byTournament = new Map<string, { tournament: ResultEvent["tournament"]; events: ResultEvent[] }>();
  for (const event of events) {
    const key = event.tournament.id;
    if (!byTournament.has(key)) {
      byTournament.set(key, { tournament: event.tournament, events: [] });
      tournamentOrder.push(key);
    }
    byTournament.get(key)!.events.push(event);
  }

  return (
    <div className="page-wrap space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-muted">
          Every current tournament&apos;s games and sessions in one place - jump straight to entering or fixing a
          result.
        </p>
      </div>

      {golfTournaments.map((t) => (
        <GolfTournamentSection key={t.id} tournament={t} />
      ))}

      {tournamentOrder.length === 0 && golfTournaments.length === 0 ? (
        <p className="text-muted">No current tournaments have any games scheduled yet.</p>
      ) : (
        tournamentOrder.map((id) => {
          const group = byTournament.get(id)!;
          return group.tournament.activity.usesMeetResults ? (
            <MeetTournamentSection key={id} group={group} />
          ) : (
            <GameTournamentSection key={id} group={group} />
          );
        })
      )}
    </div>
  );
}

type TournamentGroup = { tournament: ResultEvent["tournament"]; events: ResultEvent[] };

function SectionHeader({ tournament }: { tournament: ResultEvent["tournament"] }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-xl font-bold">
        {tournament.activity.name} <span className="font-normal text-muted">· {tournament.name}</span>
      </h2>
      <Link href={`/seasons/${tournament.slug}`} className="text-xs font-semibold text-primary hover:underline">
        View public page →
      </Link>
    </div>
  );
}

// Team-sport tournaments: one row per game, a badge for whether it still
// needs a result, and a button straight to that game's score form (the same
// EventEditForm/updateEventAction used everywhere else - this page is just a
// faster way to find the right game, not a second way to save a score).
function GameTournamentSection({ group }: { group: TournamentGroup }) {
  const now = new Date();
  const needsResult: ResultEvent[] = [];
  const upcoming: ResultEvent[] = [];
  const done: ResultEvent[] = [];
  for (const e of group.events) {
    if (e.status === "SCHEDULED") (e.date <= now ? needsResult : upcoming).push(e);
    else done.push(e);
  }

  return (
    <section className="card p-4">
      <SectionHeader tournament={group.tournament} />
      {group.events.length === 0 && <p className="text-sm text-muted">No games scheduled yet.</p>}
      <div className="space-y-5">
        {needsResult.length > 0 && <GameList title={`Needs a result (${needsResult.length})`} events={needsResult} needsResult />}
        {upcoming.length > 0 && <GameList title={`Upcoming (${upcoming.length})`} events={upcoming} />}
        {done.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted">
              Completed or cancelled ({done.length})
            </summary>
            <div className="mt-2">
              <GameList events={done} />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function GameList({ title, events, needsResult = false }: { title?: string; events: ResultEvent[]; needsResult?: boolean }) {
  return (
    <div>
      {title && (
        <h3 className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${needsResult ? "text-danger" : "text-muted"}`}>
          {title}
        </h3>
      )}
      <ul className="divide-y divide-border border-y border-border">
        {events.map((event) => (
          <GameRow key={event.id} event={event} needsResult={needsResult} />
        ))}
      </ul>
    </div>
  );
}

function GameRow({ event, needsResult }: { event: ResultEvent; needsResult: boolean }) {
  // An event with no two-school matchup (e.g. a Cross Country race) is named
  // by its title rather than "TBD vs TBD".
  const hasMatchup =
    event.participants.length > 0 ||
    Boolean(
      event.homeSourceOutcome ||
        event.awaySourceOutcome ||
        event.homeSourceStanding ||
        event.awaySourceStanding ||
        event.homeSourceLabel ||
        event.awaySourceLabel
    );
  const matchup = !hasMatchup
    ? (event.title ?? "Untitled event")
    : event.participants.length <= 2
      ? `${sideLabel(
          event.participants.find((p) => p.isHome),
          event.homeSourceOutcome,
          event.homeSourceEvent?.externalId,
          event.homeSourceStanding,
          event.homeSourceLabel
        )} vs ${sideLabel(
          event.participants.find((p) => !p.isHome),
          event.awaySourceOutcome,
          event.awaySourceEvent?.externalId,
          event.awaySourceStanding,
          event.awaySourceLabel
        )}`
      : event.participants.map((p) => p.school.name).join(" vs ");

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2">
      <div>
        <div className="text-sm font-semibold">{matchup}</div>
        <div className="text-xs text-muted">
          {event.division ? `${event.division.name} · ` : ""}
          {format(event.date, "EEE, MMM d · h:mm a")}
          {event.status === "CANCELLED" ? " · Cancelled" : ""}
        </div>
      </div>
      <Link
        href={`/dashboard/events/${event.id}`}
        className={needsResult ? "btn btn-primary px-3 py-1 text-xs" : "text-sm font-semibold text-primary hover:underline"}
      >
        {event.status === "COMPLETED" ? "Edit result" : needsResult ? "Enter result" : "Edit"}
      </Link>
    </li>
  );
}

// Meet-style tournaments (swimming, track & field, ...): there's no
// per-game score, just a per-session CSV of individual placings, so this
// simply lists the sessions and links to the one that already hosts that
// import form on the event page.
function MeetTournamentSection({ group }: { group: TournamentGroup }) {
  return (
    <section className="card p-4">
      <SectionHeader tournament={group.tournament} />
      {group.events.length === 0 ? (
        <p className="text-sm text-muted">No sessions scheduled yet.</p>
      ) : (
        <ul className="space-y-2">
          {group.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-2 first:border-t-0 first:pt-0"
            >
              <div>
                <div className="text-sm font-semibold">{event.title ?? "Untitled session"}</div>
                <div className="text-xs text-muted">{format(event.date, "EEE, MMM d, yyyy · h:mm a")}</div>
              </div>
              <Link href={`/dashboard/events/${event.id}`} className="btn btn-secondary px-3 py-1 text-xs">
                Add/edit results
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type GolfTournament = Prisma.TournamentGetPayload<{
  include: {
    activity: true;
    golfGroups: { include: { players: { select: { points: true } } } };
    golfMatches: { include: { homeSchool: true; awaySchool: true; pairs: { select: { winner: true } } } };
  };
}>;

// Golf: Day 1 groups still missing scores, and team matches that have been
// played (their start time has passed) without every pairs result in. Each
// links straight to its spot on the Golf page, where results are entered.
function GolfTournamentSection({ tournament }: { tournament: GolfTournament }) {
  const now = new Date();
  const golfPage = `/dashboard/admin/golf?tournament=${tournament.id}`;
  const label = (s: { code: string | null; name: string }) => s.code || s.name;
  const groupsMissing = tournament.golfGroups.filter((g) => g.teeTime <= now && g.players.some((p) => p.points === null));
  const matches = tournament.golfMatches.map((m) => ({ ...m, score: matchScore(m.pairs) }));
  const needsResult = matches.filter((m) => m.startTime <= now && !m.score.complete);
  const upcoming = matches.filter((m) => m.startTime > now && !m.score.complete);
  const done = matches.filter((m) => m.score.complete);
  const scored = tournament.golfGroups.reduce((n, g) => n + g.players.filter((p) => p.points !== null).length, 0);
  const players = tournament.golfGroups.reduce((n, g) => n + g.players.length, 0);

  return (
    <section className="card p-4">
      <SectionHeader tournament={{ id: tournament.id, name: tournament.name, slug: tournament.slug, activity: tournament.activity }} />
      <div className="space-y-5">
        <div>
          <h3 className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${groupsMissing.length ? "text-danger" : "text-muted"}`}>
            Day 1 scores ({scored} of {players})
          </h3>
          {tournament.golfGroups.length === 0 ? (
            <p className="text-sm text-muted">
              No Day 1 draw yet.{" "}
              <Link href={golfPage} className="font-semibold text-primary hover:underline">
                Set up the roster and draw →
              </Link>
            </p>
          ) : groupsMissing.length === 0 ? (
            <p className="text-sm text-muted">
              {scored === players ? "All scores are in." : "Nothing overdue."}{" "}
              <Link href={`${golfPage}#scores`} className="font-semibold text-primary hover:underline">
                Edit scores
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {groupsMissing.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">
                      Flight {g.flight} · Group {g.number}
                    </div>
                    <div className="text-xs text-muted">
                      {format(g.teeTime, "EEE, MMM d · h:mm a")} · {g.players.filter((p) => p.points === null).length} score
                      {g.players.filter((p) => p.points === null).length === 1 ? "" : "s"} missing
                    </div>
                  </div>
                  <Link href={`${golfPage}#group-${g.id}`} className="btn btn-primary px-3 py-1 text-xs">
                    Enter scores
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {matches.length > 0 && (
          <>
            {needsResult.length > 0 && (
              <GolfMatchList title={`Team matches needing a result (${needsResult.length})`} matches={needsResult} golfPage={golfPage} label={label} urgent />
            )}
            {upcoming.length > 0 && (
              <GolfMatchList title={`Upcoming team matches (${upcoming.length})`} matches={upcoming} golfPage={golfPage} label={label} />
            )}
            {done.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted">
                  Completed team matches ({done.length})
                </summary>
                <div className="mt-2">
                  <GolfMatchList matches={done} golfPage={golfPage} label={label} />
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function GolfMatchList({
  title,
  matches,
  golfPage,
  label,
  urgent = false,
}: {
  title?: string;
  matches: (GolfTournament["golfMatches"][number] & { score: ReturnType<typeof matchScore> })[];
  golfPage: string;
  label: (s: { code: string | null; name: string }) => string;
  urgent?: boolean;
}) {
  return (
    <div>
      {title && (
        <h3 className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${urgent ? "text-danger" : "text-muted"}`}>{title}</h3>
      )}
      <ul className="divide-y divide-border border-y border-border">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div>
              <div className="text-sm font-semibold">
                {label(m.homeSchool)} vs {label(m.awaySchool)}
                {m.score.decided > 0 && (
                  <span className="ml-2 tabular-nums">
                    {formatGolfPoints(m.score.home)}–{formatGolfPoints(m.score.away)}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted">
                Round {m.round} · {format(m.startTime, "EEE, MMM d · h:mm a")}
                {!m.score.complete && m.score.decided > 0 && ` · ${m.score.decided} of ${m.score.total} in`}
              </div>
            </div>
            <Link
              href={`${golfPage}#match-${m.id}`}
              className={urgent ? "btn btn-primary px-3 py-1 text-xs" : "text-sm font-semibold text-primary hover:underline"}
            >
              {m.score.complete ? "Edit result" : urgent ? "Enter result" : "Edit"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
