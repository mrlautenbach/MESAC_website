import Link from "next/link";
import { startOfToday } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SCHEDULE_ORDER } from "@/lib/eventOrder";
import { computeStandings, computeLowScoreTeamStandings, computeIndividualStandings } from "@/lib/standings";
import { SchoolBadge } from "@/components/SchoolBadge";
import { EventRows } from "@/components/EventRows";
import { MeetScheduleTable, type MeetScheduleRow } from "@/components/MeetScheduleTable";
import type { Clock } from "@/lib/timeZones";

type Activity = {
  id: string;
  scoringType: "WIN_LOSS" | "LOW_SCORE" | "NONE";
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  showWins: boolean;
  showLosses: boolean;
  showPointsFor: boolean;
  showPointsAgainst: boolean;
  showPlayed: boolean;
  usesSetScores: boolean;
  usesMeetResults: boolean;
};

type Scope = { tournamentId: string; tournamentSlug: string; divisionId?: string | null; clock: Clock };

// The full schedule for a tournament (or one of its divisions) - every
// game regardless of status, in date order. Lives at its own page so it
// can be linked to directly, separate from the Results page.
export async function TournamentSchedule({ tournamentId, tournamentSlug, divisionId, activity, clock }: Scope & { activity: Activity }) {
  if (activity.usesMeetResults) {
    return (
      <section>
        <MeetSchedule tournamentId={tournamentId} tournamentSlug={tournamentSlug} divisionId={divisionId} clock={clock} />
      </section>
    );
  }
  return (
    <section>
      <EventsTable
        tournamentId={tournamentId}
        tournamentSlug={tournamentSlug}
        divisionId={divisionId}
        activityId={activity.id}
        scoringType={activity.scoringType}
        usesSetScores={activity.usesSetScores}
        statusFilter={null}
        emptyMessage="No events scheduled yet."
        clock={clock}
      />
    </section>
  );
}

// A meet's schedule is really its program: one row per named event round
// (MeetProgramEntry), not one row per session - a single session can hold
// races for several divisions and genders, and a race's prelim/final can
// even land in two different sessions. Each round owns its own
// scheduledTime/location/status/liveStreamUrl (see the combined
// schedule+program CSV, meet-schedule.ts) - the session it's linked to is
// just where it's grouped for display/admin purposes. Sorted by that
// round's own scheduled time, then event_number numerically, then division
// and gender as tie-breakers. A session with no program rows at all (e.g.
// left over from before the combined CSV, or created but not yet
// populated) still shows up as a plain row so it isn't silently invisible.
//
// Every row for the whole tournament is fetched here regardless of which
// page this is - division/gender filtering happens client-side in
// MeetScheduleTable, so switching between them doesn't need a page
// navigation the way moving between the separate Overall/Varsity/Junior
// Varsity pages does. `divisionId` (this page's own division, if any) only
// seeds which one the filter starts on.
async function MeetSchedule({ tournamentId, tournamentSlug, divisionId, clock }: Scope) {
  const [entries, unprogrammed, currentDivision] = await Promise.all([
    prisma.meetProgramEntry.findMany({
      where: { tournamentId },
      include: {
        event: { select: { slug: true, title: true } },
        division: true,
      },
      orderBy: [{ scheduledTime: "asc" }, { eventNumber: "asc" }, { division: { name: "asc" } }, { gender: "asc" }],
    }),
    prisma.event.findMany({
      where: { tournamentId, programEntries: { none: {} } },
      orderBy: { date: "asc" },
      select: { id: true, slug: true, title: true, date: true, status: true, division: true },
    }),
    divisionId ? prisma.division.findUnique({ where: { id: divisionId }, select: { slug: true } }) : null,
  ]);

  const rows: MeetScheduleRow[] = [
    ...entries.map((e) => ({
      key: e.id,
      date: e.scheduledTime,
      sessionId: e.eventId,
      sessionTitle: e.event.title ?? "Untitled session",
      sessionSlug: e.event.slug,
      eventNumber: e.eventNumber,
      eventName: e.eventName,
      round: e.round,
      division: e.division,
      status: e.status,
      liveStreamUrl: e.liveStreamUrl,
    })),
    ...unprogrammed.map((s) => ({
      key: s.id,
      date: s.date,
      sessionId: s.id,
      sessionTitle: s.title ?? "Untitled session",
      sessionSlug: s.slug,
      eventNumber: null,
      eventName: null,
      round: null,
      // No program rows for this session - it may still carry its own
      // division (set directly on the session) - show that rather than
      // blanking it out.
      division: s.division,
      status: s.status,
      liveStreamUrl: null,
    })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((row) => ({
      ...row,
      timeLabel: clock.when(row.date, "h:mm a"),
      headingLabel: clock.when(row.date, "EEEE d MMMM yyyy · h:mm a", "EEEE d MMMM yyyy"),
    }));

  return (
    <MeetScheduleTable rows={rows} tournamentSlug={tournamentSlug} initialDivisionSlug={currentDivision?.slug} />
  );
}

// The results page: the standings table (if this activity uses one) plus
// completed games only - upcoming/scheduled games belong on the Schedule
// page, not here.
export async function TournamentResults({ tournamentId, tournamentSlug, divisionId, activity, clock }: Scope & { activity: Activity }) {
  const schools = await prisma.school.findMany({ select: { id: true, themeColor: true, themeColorSecondary: true, logoUrl: true } });
  const colorBySchoolId = new Map(
    schools.map((s) => [s.id, { color: s.themeColor, secondaryColor: s.themeColorSecondary, logoUrl: s.logoUrl }])
  );

  return (
    <div className="space-y-10">
      {activity.scoringType === "WIN_LOSS" && (
        <WinLossStandings tournamentId={tournamentId} divisionId={divisionId} activity={activity} colorBySchoolId={colorBySchoolId} />
      )}
      {activity.scoringType === "LOW_SCORE" && (
        <LowScoreStandings tournamentId={tournamentId} divisionId={divisionId} colorBySchoolId={colorBySchoolId} />
      )}
      {activity.scoringType === "NONE" && (
        <p className="text-sm text-muted">This activity doesn&apos;t use a results table. Check each event below.</p>
      )}

      <section>
        <h4 className="mb-3">{activity.scoringType === "NONE" ? "Completed events" : "Completed games"}</h4>
        <EventsTable
          tournamentId={tournamentId}
          tournamentSlug={tournamentSlug}
          divisionId={divisionId}
          activityId={activity.id}
          scoringType={activity.scoringType}
          usesSetScores={activity.usesSetScores}
          statusFilter="COMPLETED"
          clock={clock}
          emptyMessage={activity.scoringType === "NONE" ? "No events have been completed yet." : "No games have been completed yet."}
        />
      </section>
    </div>
  );
}

// The next few games for a tournament's landing page, across every
// division, so visitors see what's on without picking a tab first.
export async function UpcomingGames({
  tournamentId,
  tournamentSlug,
  activity,
  clock,
  limit = 5,
}: {
  tournamentId: string;
  tournamentSlug: string;
  activity: Activity;
  clock: Clock;
  limit?: number;
}) {
  // "Nothing else" only makes sense once there's been something.
  const scheduled = await prisma.event.count({ where: { tournamentId } });
  return (
    <EventsTable
      tournamentId={tournamentId}
      tournamentSlug={tournamentSlug}
      activityId={activity.id}
      scoringType={activity.scoringType}
      usesSetScores={activity.usesSetScores}
      statusFilter="UPCOMING"
      clock={clock}
      emptyMessage={scheduled === 0 ? "No games scheduled yet." : "Nothing else is scheduled right now."}
      limit={limit}
    />
  );
}

async function EventsTable({
  tournamentId,
  tournamentSlug,
  divisionId,
  activityId,
  scoringType,
  usesSetScores,
  statusFilter,
  emptyMessage,
  limit,
  clock,
}: {
  tournamentId: string;
  tournamentSlug: string;
  divisionId?: string | null;
  activityId: string;
  scoringType: Activity["scoringType"];
  usesSetScores: boolean;
  // "UPCOMING" = still scheduled and not yet in the past.
  statusFilter: "COMPLETED" | "UPCOMING" | null;
  emptyMessage: string;
  limit?: number;
  clock: Clock;
}) {
  const where = {
    tournamentId,
    // A meet-style session can mix divisions (see MeetProgramEntry/MeetResult
    // - one named event's division is independent of its whole session's
    // Event.divisionId), so a session belongs to a division's page either
    // because the whole session is assigned to it (team sports) or because
    // at least one of its named events/results is (meets).
    ...(divisionId
      ? { OR: [{ divisionId }, { programEntries: { some: { divisionId } } }, { meetResults: { some: { divisionId } } }] }
      : {}),
    ...(statusFilter === "COMPLETED" ? { status: "COMPLETED" as const } : {}),
    ...(statusFilter === "UPCOMING" ? { status: "SCHEDULED" as const, date: { gte: startOfToday() } } : {}),
  };

  const [events, customFields] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: SCHEDULE_ORDER,
      take: limit,
      include: {
        participants: { include: { school: true } },
        results: true,
        sets: { orderBy: { setNumber: "asc" } },
        homeSourceEvent: { select: { externalId: true } },
        awaySourceEvent: { select: { externalId: true } },
        fieldValues: true,
        division: true,
      },
    }),
    prisma.activityField.findMany({ where: { activityId }, orderBy: { order: "asc" } }),
  ]);

  const showWatch = statusFilter !== "COMPLETED";

  if (events.length === 0) return <p className="text-muted">{emptyMessage}</p>;

  // Only meaningful when this list actually spans more than one division at
  // once (the Overall page for a meet-style activity) - a tournament with no
  // divisions, or a single-division page, would just show an empty column.
  const showDivisionTag = !divisionId && events.some((e) => e.divisionId);

  return (
    <EventRows
      events={events}
      customFields={customFields}
      tournamentSlug={tournamentSlug}
      scoringType={scoringType}
      usesSetScores={usesSetScores}
      showDivisionTag={showDivisionTag}
      showWatch={showWatch}
      clock={clock}
    />
  );
}

async function WinLossStandings({
  tournamentId,
  divisionId,
  activity,
  colorBySchoolId,
}: {
  tournamentId: string;
  divisionId?: string | null;
  activity: Activity;
  colorBySchoolId: Map<string, { color: string | null; secondaryColor: string | null; logoUrl: string | null }>;
}) {
  const standings = await computeStandings(tournamentId, activity, divisionId);
  return (
    <section>
      <h4 className="mb-3">Standings</h4>
      {standings.length === 0 ? (
        <p className="text-muted">No results have been posted yet.</p>
      ) : (
        <>
          {/* Below sm: one card per school instead of a wide table. */}
          <div className="space-y-2 sm:hidden">
            {standings.map((row, i) => (
              <div key={row.schoolId} className="card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-extrabold">
                    <span className="text-primary-deep">{i + 1}.</span>
                    <SchoolBadge
                      size={36}
                      logoUrl={colorBySchoolId.get(row.schoolId)?.logoUrl}
                      name={row.schoolName}
                      color={colorBySchoolId.get(row.schoolId)?.color}
                      secondaryColor={colorBySchoolId.get(row.schoolId)?.secondaryColor}
                    />
                    <Link href={`/schools/${row.schoolSlug}`} className="hover:text-primary hover:underline">
                      {row.schoolName}
                    </Link>
                  </span>
                  <span className="text-[17px] font-extrabold tabular-nums">{row.points} pts</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {activity.showPlayed && <span>P {row.played}</span>}
                  {activity.showWins && <span>W {row.wins}</span>}
                  {activity.showLosses && <span>L {row.losses}</span>}
                  {row.draws > 0 && <span>D {row.draws}</span>}
                  {activity.showPointsFor && <span>For {row.totalScore}</span>}
                  {activity.showPointsAgainst && <span>Ag {row.against}</span>}
                  <span>
                    Diff {row.totalScore - row.against > 0 ? "+" : ""}
                    {row.totalScore - row.against}
                  </span>
                  <span>Form {row.form.join(" ") || "—"}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
          <table className="mtable">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>School</th>
                {activity.showPlayed && <th className="text-right">P</th>}
                {activity.showWins && <th className="text-right">W</th>}
                {activity.showLosses && <th className="text-right">L</th>}
                {activity.showPointsFor && <th className="text-right">For</th>}
                {activity.showPointsAgainst && <th className="text-right">Ag</th>}
                <th className="text-right">Diff</th>
                <th className="text-right">Pts</th>
                <th className="text-right">Form</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.schoolId}>
                  <td className="text-[17px] font-extrabold text-primary-deep">{i + 1}</td>
                  <td className="font-extrabold">
                    <span className="inline-flex items-center gap-1">
                      <SchoolBadge
                        size={36}
                        logoUrl={colorBySchoolId.get(row.schoolId)?.logoUrl}
                        name={row.schoolName}
                        color={colorBySchoolId.get(row.schoolId)?.color}
                        secondaryColor={colorBySchoolId.get(row.schoolId)?.secondaryColor}
                      />
                      <Link href={`/schools/${row.schoolSlug}`} className="hover:text-primary hover:underline">
                        {row.schoolName}
                      </Link>
                    </span>{" "}
                    {row.draws > 0 && <span className="font-normal text-muted">· {row.draws} drawn</span>}
                  </td>
                  {activity.showPlayed && <td className="text-right tabular-nums">{row.played}</td>}
                  {activity.showWins && <td className="text-right tabular-nums">{row.wins}</td>}
                  {activity.showLosses && <td className="text-right tabular-nums">{row.losses}</td>}
                  {activity.showPointsFor && <td className="text-right tabular-nums">{row.totalScore}</td>}
                  {activity.showPointsAgainst && <td className="text-right tabular-nums">{row.against}</td>}
                  <td className="text-right tabular-nums">
                    {row.totalScore - row.against > 0 ? "+" : ""}
                    {row.totalScore - row.against}
                  </td>
                  <td className="text-right text-[17px] font-extrabold tabular-nums">{row.points}</td>
                  <td className="text-right text-xs tracking-[0.1em] text-muted">{row.form.join(" ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
      <p className="mt-2 text-xs text-muted">
        {/* A game played in sets (volleyball) always has a winner - no draws to mention. */}
        {activity.usesSetScores
          ? `${activity.winPoints} pts for a win, ${activity.lossPoints} for a loss.`
          : `${activity.winPoints} pts for a win, ${activity.drawPoints} for a draw, ${activity.lossPoints} for a loss.`}
      </p>
    </section>
  );
}

async function LowScoreStandings({
  tournamentId,
  divisionId,
  colorBySchoolId,
}: {
  tournamentId: string;
  divisionId?: string | null;
  colorBySchoolId: Map<string, { color: string | null; secondaryColor: string | null; logoUrl: string | null }>;
}) {
  const [teams, individuals] = await Promise.all([
    computeLowScoreTeamStandings(tournamentId, divisionId),
    computeIndividualStandings(tournamentId, divisionId),
  ]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h4 className="mb-3">Team results</h4>
        {teams.length === 0 ? (
          <p className="text-muted">No results have been posted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mtable">
              <thead>
                <tr>
                  <th>School</th>
                  <th className="text-right">Played</th>
                  <th className="text-right">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((row) => (
                  <tr key={row.schoolId}>
                    <td className="font-extrabold">
                      <span className="inline-flex items-center gap-1">
                        <SchoolBadge
                          size={36}
                          logoUrl={colorBySchoolId.get(row.schoolId)?.logoUrl}
                          name={row.schoolName}
                          color={colorBySchoolId.get(row.schoolId)?.color}
                          secondaryColor={colorBySchoolId.get(row.schoolId)?.secondaryColor}
                        />
                        <Link href={`/schools/${row.schoolSlug}`} className="hover:text-primary hover:underline">
                          {row.schoolName}
                        </Link>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{row.played}</td>
                    <td className="text-right text-[17px] font-extrabold tabular-nums">{row.avgScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Lowest average score ranks first.</p>
      </section>

      <section>
        <h4 className="mb-3">Individual results</h4>
        {individuals.length === 0 ? (
          <p className="text-muted">No individual scores have been posted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mtable">
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>School</th>
                  <th className="text-right">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {individuals.slice(0, 15).map((row) => (
                  <tr key={`${row.schoolId}-${row.athleteName}`}>
                    <td className="font-extrabold">{row.athleteName}</td>
                    <td className="text-muted">
                      <span className="inline-flex items-center gap-1">
                        <SchoolBadge
                          size={36}
                          logoUrl={colorBySchoolId.get(row.schoolId)?.logoUrl}
                          name={row.schoolName}
                          color={colorBySchoolId.get(row.schoolId)?.color}
                          secondaryColor={colorBySchoolId.get(row.schoolId)?.secondaryColor}
                        />
                        <Link href={`/schools/${row.schoolSlug}`} className="hover:text-primary hover:underline">
                          {row.schoolName}
                        </Link>
                      </span>
                    </td>
                    <td className="text-right text-[17px] font-extrabold tabular-nums">{row.avgScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


