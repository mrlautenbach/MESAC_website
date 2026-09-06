import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { computeStandings, computeLowScoreTeamStandings, computeIndividualStandings } from "@/lib/standings";
import { sideLabel } from "@/lib/eventDisplay";
import { SchoolBadge } from "@/components/SchoolBadge";
import { LiveIcon } from "@/components/icons/LiveIcon";

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
};

type Scope = { tournamentId: string; tournamentSlug: string; divisionId?: string | null };

// The full schedule for a tournament (or one of its divisions) - every
// game regardless of status, in date order. Lives at its own page so it
// can be linked to directly, separate from the Results page.
export async function TournamentSchedule({ tournamentId, tournamentSlug, divisionId, activity }: Scope & { activity: Activity }) {
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
        <p className="text-sm text-muted">This activity doesn&apos;t use a results table. Check each game below.</p>
      )}

      <section>
        <h4 className="mb-3">Completed games</h4>
        <EventsTable
          tournamentId={tournamentId}
          tournamentSlug={tournamentSlug}
          divisionId={divisionId}
          activityId={activity.id}
          scoringType={activity.scoringType}
          usesSetScores={activity.usesSetScores}
          statusFilter="COMPLETED"
          emptyMessage="No games have been completed yet."
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
    ...(divisionId ? { divisionId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [events, customFields] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { date: "asc" },
      include: {
        participants: { include: { school: true } },
        results: true,
        sets: { orderBy: { setNumber: "asc" } },
        homeSourceEvent: { select: { externalId: true } },
        awaySourceEvent: { select: { externalId: true } },
        fieldValues: true,
      },
    }),
    prisma.activityField.findMany({ where: { activityId }, orderBy: { order: "asc" } }),
  ]);

  const eventHref = (eventSlug: string) => `/seasons/${tournamentSlug}/events/${eventSlug}`;
  const showWatch = statusFilter === null;

  if (events.length === 0) return <p className="text-muted">{emptyMessage}</p>;

  // Grouped by calendar day - each group gets a date banner instead of a
  // per-row Date column, freeing up width for a bigger school badge.
  // events is already ordered by date asc, so first-seen day order is
  // already chronological.
  const dayGroups: { key: string; events: typeof events }[] = [];
  const dayIndexByKey = new Map<string, number>();
  for (const event of events) {
    const key = format(event.date, "yyyy-MM-dd");
    if (!dayIndexByKey.has(key)) {
      dayIndexByKey.set(key, dayGroups.length);
      dayGroups.push({ key, events: [] });
    }
    dayGroups[dayIndexByKey.get(key)!].events.push(event);
  }

  return (
    <>
      {/* Below sm: one card per game instead of a wide table, so every
          column (score, sets, date, status, watch link) stays readable
          without horizontal scrolling. Desktop keeps the table as-is. */}
      <div className="space-y-3 sm:hidden">
        {events.map((event) => {
          const home = event.participants.find((p) => p.isHome);
          const away = event.participants.find((p) => !p.isHome);
          const homeResult = home && event.results.find((r) => r.schoolId === home.schoolId);
          const awayResult = away && event.results.find((r) => r.schoolId === away.schoolId);
          const valueByFieldId = new Map(event.fieldValues.map((v) => [v.fieldId, v.value]));
          const hasFieldValues = customFields.some((f) => valueByFieldId.get(f.id));
          return (
            <div key={event.id} className="card p-3 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
                <Link href={eventHref(event.slug)} className="hover:text-primary">
                  {format(event.date, "MMM d, yyyy")} · {format(event.date, "h:mm a")}
                  {scoringType !== "NONE" && event.externalId ? ` · ${event.externalId}` : ""}
                </Link>
                {showWatch && <StatusTag status={event.status} />}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 font-extrabold hover:text-primary">
                    <SchoolBadge
                      size={36}
                      logoUrl={home?.school.logoUrl}
                      name={home?.school.name ?? "TBD"}
                      color={home?.school.themeColor}
                      secondaryColor={home?.school.themeColorSecondary}
                    />
                    {sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)}
                  </Link>
                  {scoringType !== "NONE" && <span className="tabular-nums font-extrabold">{homeResult?.score ?? "—"}</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 font-extrabold hover:text-primary">
                    <SchoolBadge
                      size={36}
                      logoUrl={away?.school.logoUrl}
                      name={away?.school.name ?? "TBD"}
                      color={away?.school.themeColor}
                      secondaryColor={away?.school.themeColorSecondary}
                    />
                    {sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId)}
                  </Link>
                  {scoringType !== "NONE" && <span className="tabular-nums font-extrabold">{awayResult?.score ?? "—"}</span>}
                </div>
              </div>
              {usesSetScores && (
                <p className="mt-2 text-xs text-muted">
                  Sets: {event.sets.length > 0 ? event.sets.map((s) => `${s.homeScore}-${s.awayScore}`).join(", ") : "—"}
                </p>
              )}
              {(event.location || hasFieldValues) && (
                <p className="mt-2 text-xs text-muted">
                  {event.location ?? "—"}
                  {customFields.map(
                    (f) => valueByFieldId.get(f.id) && <span key={f.id}> · {f.label}: {valueByFieldId.get(f.id)}</span>
                  )}
                </p>
              )}
              {showWatch && event.streamUrl && event.status === "SCHEDULED" && (
                <a
                  href={event.streamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tag tag-accent mt-2 inline-flex gap-1"
                >
                  <LiveIcon />
                  Watch live
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: grouped by day under a date banner instead of a per-row
          Date column - frees up width for a bigger school badge. */}
      <div className="hidden space-y-6 sm:block">
        {dayGroups.map((group) => (
          <div key={group.key}>
            <h5 className="mb-2 border-b-2 border-divider pb-1.5 text-sm font-bold text-primary-dark">
              {format(group.events[0].date, "EEEE, MMM d, yyyy")}
            </h5>
            <div className="overflow-x-auto">
              <table className="mtable">
                <thead>
                  <tr>
                    {scoringType !== "NONE" && <th>Game</th>}
                    <th>Home</th>
                    {scoringType !== "NONE" && (
                      <th className="text-center" style={{ width: 56 }}>
                        Score
                      </th>
                    )}
                    <th>Away</th>
                    {scoringType !== "NONE" && (
                      <th className="text-center" style={{ width: 56 }}>
                        Score
                      </th>
                    )}
                    {usesSetScores && <th>Sets</th>}
                    <th>Time</th>
                    <th>Court</th>
                    {customFields.map((f) => (
                      <th key={f.id}>{f.label}</th>
                    ))}
                    {showWatch && (
                      <>
                        <th>Status</th>
                        <th>Watch</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {group.events.map((event) => {
                    const home = event.participants.find((p) => p.isHome);
                    const away = event.participants.find((p) => !p.isHome);
                    const homeResult = home && event.results.find((r) => r.schoolId === home.schoolId);
                    const awayResult = away && event.results.find((r) => r.schoolId === away.schoolId);
                    const valueByFieldId = new Map(event.fieldValues.map((v) => [v.fieldId, v.value]));
                    return (
                      <tr key={event.id}>
                        {scoringType !== "NONE" && (
                          <td className="text-muted">
                            <Link href={eventHref(event.slug)} className="hover:text-primary">
                              {event.externalId ?? "—"}
                            </Link>
                          </td>
                        )}
                        <td className="font-extrabold">
                          <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 hover:text-primary">
                            <SchoolBadge
                              size={36}
                              logoUrl={home?.school.logoUrl}
                              name={home?.school.name ?? "TBD"}
                              color={home?.school.themeColor}
                              secondaryColor={home?.school.themeColorSecondary}
                            />
                            {sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)}
                          </Link>
                        </td>
                        {scoringType !== "NONE" && (
                          <td className="text-center tabular-nums">{homeResult?.score ?? "—"}</td>
                        )}
                        <td className="font-extrabold">
                          <Link href={eventHref(event.slug)} className="inline-flex items-center gap-1 hover:text-primary">
                            <SchoolBadge
                              size={36}
                              logoUrl={away?.school.logoUrl}
                              name={away?.school.name ?? "TBD"}
                              color={away?.school.themeColor}
                              secondaryColor={away?.school.themeColorSecondary}
                            />
                            {sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId)}
                          </Link>
                        </td>
                        {scoringType !== "NONE" && (
                          <td className="text-center tabular-nums">{awayResult?.score ?? "—"}</td>
                        )}
                        {usesSetScores && (
                          <td className="whitespace-nowrap text-sm text-muted">
                            {event.sets.length > 0
                              ? event.sets.map((s) => `${s.homeScore}-${s.awayScore}`).join(", ")
                              : "—"}
                          </td>
                        )}
                        <td className="text-muted tabular-nums">{format(event.date, "h:mm a")}</td>
                        <td className="text-muted">{event.location ?? "—"}</td>
                        {customFields.map((f) => (
                          <td key={f.id} className="text-muted">
                            {valueByFieldId.get(f.id) ?? "—"}
                          </td>
                        ))}
                        {showWatch && (
                          <>
                            <td>
                              <StatusTag status={event.status} />
                            </td>
                            <td>
                              {event.streamUrl && event.status === "SCHEDULED" ? (
                                <a href={event.streamUrl} target="_blank" rel="noopener noreferrer" className="tag tag-accent gap-1">
                                  <LiveIcon />
                                  Watch live
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
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
  const standings = await computeStandings(tournamentId, divisionId);
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

export function StatusTag({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SCHEDULED: "tag-accent",
    COMPLETED: "tag-neutral",
    CANCELLED: "tag-outline",
  };
  return <span className={`tag ${styles[status] ?? "tag-neutral"}`}>{status}</span>;
}
