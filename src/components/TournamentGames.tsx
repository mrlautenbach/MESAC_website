import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { computeStandings, computeLowScoreTeamStandings, computeIndividualStandings } from "@/lib/standings";
import { SchoolBadge } from "@/components/SchoolBadge";
import { EventRows } from "@/components/EventRows";
import { StatusTag } from "@/components/StatusTag";
import { divisionTagClass } from "@/lib/divisionTagClass";
import { GENDER_LABEL, GENDER_TAG_CLASS } from "@/lib/gender";

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

type Scope = { tournamentId: string; tournamentSlug: string; divisionId?: string | null };

// The full schedule for a tournament (or one of its divisions) - every
// game regardless of status, in date order. Lives at its own page so it
// can be linked to directly, separate from the Results page.
export async function TournamentSchedule({ tournamentId, tournamentSlug, divisionId, activity }: Scope & { activity: Activity }) {
  if (activity.usesMeetResults) {
    return (
      <section>
        <MeetSchedule
          tournamentId={tournamentId}
          tournamentSlug={tournamentSlug}
          divisionId={divisionId}
          emptyMessage="No events scheduled yet."
        />
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
      />
    </section>
  );
}

// A meet's schedule is really its program: one row per named event
// (MeetProgramEntry), not one row per session - a single session can hold
// races for several divisions and genders, and each one may run as a
// preliminary and a final. Sorted by session date, then event_number
// numerically (an event_number is only ever reused across different
// sessions, never within one), then division and gender as tie-breakers.
// Sessions with no program uploaded yet still show up (Overall page only -
// a division-scoped page has nothing to place them on), as a plain row so
// the date/time is still visible before the program's set up.
async function MeetSchedule({
  tournamentId,
  tournamentSlug,
  divisionId,
  emptyMessage,
}: {
  tournamentId: string;
  tournamentSlug: string;
  divisionId?: string | null;
  emptyMessage: string;
}) {
  const entries = await prisma.meetProgramEntry.findMany({
    where: { event: { tournamentId }, ...(divisionId ? { divisionId } : {}) },
    include: {
      event: { select: { slug: true, title: true, date: true, location: true, status: true } },
      division: true,
    },
    orderBy: [{ event: { date: "asc" } }, { eventNumber: "asc" }, { division: { name: "asc" } }, { gender: "asc" }],
  });
  const unprogrammed = divisionId
    ? []
    : await prisma.event.findMany({
        where: { tournamentId, programEntries: { none: {} } },
        orderBy: { date: "asc" },
        select: { id: true, slug: true, title: true, date: true, location: true, status: true },
      });

  type Row = {
    key: string;
    date: Date;
    sessionTitle: string;
    sessionSlug: string;
    eventName: string | null;
    round: "PRELIM" | "FINAL" | null;
    division: { name: string } | null;
    gender: "GIRLS" | "BOYS" | null;
    location: string | null;
    status: string;
  };

  const rows: Row[] = [
    ...entries.map((e) => ({
      key: e.id,
      date: e.event.date,
      sessionTitle: e.event.title ?? "Untitled session",
      sessionSlug: e.event.slug,
      eventName: e.eventName,
      round: e.round,
      division: e.division,
      gender: e.gender,
      location: e.event.location,
      status: e.event.status,
    })),
    ...unprogrammed.map((s) => ({
      key: s.id,
      date: s.date,
      sessionTitle: s.title ?? "Untitled session",
      sessionSlug: s.slug,
      eventName: null,
      round: null,
      division: null,
      gender: null,
      location: s.location,
      status: s.status,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (rows.length === 0) return <p className="text-muted">{emptyMessage}</p>;

  // Each column only appears when at least one row actually has something to
  // put in it - a tournament with a single division, or no program entries
  // with a gender set, would otherwise show an empty column throughout.
  const showDivisionCol = !divisionId && rows.some((r) => r.division);
  const showGenderCol = rows.some((r) => r.gender);
  const showRoundCol = rows.some((r) => r.round);

  const dayGroups: { key: string; rows: Row[] }[] = [];
  const indexByDay = new Map<string, number>();
  for (const row of rows) {
    const key = format(row.date, "yyyy-MM-dd");
    if (!indexByDay.has(key)) {
      indexByDay.set(key, dayGroups.length);
      dayGroups.push({ key, rows: [] });
    }
    dayGroups[indexByDay.get(key)!].rows.push(row);
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((group) => (
        <div key={group.key}>
          <h5 className="mb-2 border-b-2 border-divider pb-1.5 text-sm font-bold text-primary-dark">
            {format(group.rows[0].date, "EEEE, MMM d, yyyy")}
          </h5>
          <div className="overflow-x-auto">
            <table className="mtable">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Session</th>
                  <th>Event</th>
                  {showRoundCol && <th>Round</th>}
                  {showDivisionCol && <th>Division</th>}
                  {showGenderCol && <th>Gender</th>}
                  <th>Court</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="whitespace-nowrap tabular-nums">{format(row.date, "h:mm a")}</td>
                    <td>
                      <Link
                        href={`/seasons/${tournamentSlug}/events/${row.sessionSlug}`}
                        className="font-semibold hover:text-primary"
                      >
                        {row.sessionTitle}
                      </Link>
                    </td>
                    <td>{row.eventName ?? "—"}</td>
                    {showRoundCol && <td>{row.round ? (row.round === "PRELIM" ? "Preliminary" : "Final") : "—"}</td>}
                    {showDivisionCol && (
                      <td>
                        {row.division ? (
                          <span className={`tag ${divisionTagClass(row.division.name)}`}>{row.division.name}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {showGenderCol && (
                      <td>
                        {row.gender ? (
                          <span className={`tag ${GENDER_TAG_CLASS[row.gender]}`}>{GENDER_LABEL[row.gender]}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td>{row.location ?? "—"}</td>
                    <td>
                      <StatusTag status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// The results page: the standings table (if this activity uses one) plus
// completed games only - upcoming/scheduled games belong on the Schedule
// page, not here.
export async function TournamentResults({ tournamentId, tournamentSlug, divisionId, activity }: Scope & { activity: Activity }) {
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
          emptyMessage={activity.scoringType === "NONE" ? "No events have been completed yet." : "No games have been completed yet."}
        />
      </section>
    </div>
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
}: {
  tournamentId: string;
  tournamentSlug: string;
  divisionId?: string | null;
  activityId: string;
  scoringType: Activity["scoringType"];
  usesSetScores: boolean;
  statusFilter: "COMPLETED" | null;
  emptyMessage: string;
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
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [events, customFields] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ order: { sort: "asc", nulls: "last" } }, { date: "asc" }],
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

  const showWatch = statusFilter === null;

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
                    {row.schoolName}
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
                      {row.schoolName}
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
        {activity.winPoints} pts for a win, {activity.drawPoints} for a draw, {activity.lossPoints} for a loss.
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
                        {row.schoolName}
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
                        {row.schoolName}
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


