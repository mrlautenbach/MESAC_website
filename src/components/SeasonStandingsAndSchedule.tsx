import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { computeStandings, computeLowScoreTeamStandings, computeIndividualStandings } from "@/lib/standings";
import { sideLabel } from "@/lib/eventDisplay";

type Tournament = {
  id: string;
  scoringType: "WIN_LOSS" | "LOW_SCORE" | "NONE";
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
};

// Shared by the season (edition) page for ungendered tournaments and the
// division sub-page for gendered ones - same rendering, just scoped to a
// division or not.
export async function SeasonStandingsAndSchedule({
  seasonId,
  seasonSlug,
  divisionId,
  tournament,
}: {
  seasonId: string;
  seasonSlug: string;
  divisionId?: string | null;
  tournament: Tournament;
}) {
  const [events, customFields] = await Promise.all([
    prisma.event.findMany({
      where: divisionId ? { seasonId, divisionId } : { seasonId },
      orderBy: { date: "asc" },
      include: {
        participants: { include: { school: true } },
        results: true,
        homeSourceEvent: { select: { externalId: true } },
        awaySourceEvent: { select: { externalId: true } },
        fieldValues: true,
      },
    }),
    prisma.tournamentField.findMany({ where: { tournamentId: tournament.id }, orderBy: { order: "asc" } }),
  ]);

  // Event detail always lives at one canonical URL regardless of division -
  // an event's identity is (seasonId, slug), not tied to the division route.
  const eventHref = (eventSlug: string) => `/seasons/${seasonSlug}/events/${eventSlug}`;

  return (
    <div className="space-y-10">
      {tournament.scoringType === "WIN_LOSS" && (
        <WinLossStandings seasonId={seasonId} divisionId={divisionId} tournament={tournament} />
      )}
      {tournament.scoringType === "LOW_SCORE" && <LowScoreStandings seasonId={seasonId} divisionId={divisionId} />}
      {tournament.scoringType === "NONE" && (
        <p className="text-sm text-muted">
          This activity doesn&apos;t use a standings table — check each event below for results.
        </p>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h4>Schedule</h4>
        </div>
        {events.length === 0 ? (
          <p className="text-muted">No events scheduled yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mtable">
              <thead>
                <tr>
                  {tournament.scoringType !== "NONE" && <th>Game</th>}
                  <th>Home</th>
                  {tournament.scoringType !== "NONE" && <th className="text-right">Score</th>}
                  <th>Away</th>
                  {tournament.scoringType !== "NONE" && <th className="text-right">Score</th>}
                  <th>Date</th>
                  <th>Time</th>
                  <th>Court</th>
                  {customFields.map((f) => (
                    <th key={f.id}>{f.label}</th>
                  ))}
                  <th>Status</th>
                  <th>Watch</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const home = event.participants.find((p) => p.isHome);
                  const away = event.participants.find((p) => !p.isHome);
                  const homeResult = home && event.results.find((r) => r.schoolId === home.schoolId);
                  const awayResult = away && event.results.find((r) => r.schoolId === away.schoolId);
                  const valueByFieldId = new Map(event.fieldValues.map((v) => [v.fieldId, v.value]));
                  return (
                    <tr key={event.id}>
                      {tournament.scoringType !== "NONE" && (
                        <td className="text-muted">
                          <Link href={eventHref(event.slug)} className="hover:text-primary">
                            {event.externalId ?? "—"}
                          </Link>
                        </td>
                      )}
                      <td className="font-extrabold">
                        <Link href={eventHref(event.slug)} className="hover:text-primary">
                          {sideLabel(home, event.homeSourceOutcome, event.homeSourceEvent?.externalId)}
                        </Link>
                      </td>
                      {tournament.scoringType !== "NONE" && (
                        <td className="text-right tabular-nums">{homeResult?.score ?? "—"}</td>
                      )}
                      <td className="font-extrabold">
                        <Link href={eventHref(event.slug)} className="hover:text-primary">
                          {sideLabel(away, event.awaySourceOutcome, event.awaySourceEvent?.externalId)}
                        </Link>
                      </td>
                      {tournament.scoringType !== "NONE" && (
                        <td className="text-right tabular-nums">{awayResult?.score ?? "—"}</td>
                      )}
                      <td className="text-muted">{format(event.date, "MMM d, yyyy")}</td>
                      <td className="text-muted tabular-nums">{format(event.date, "h:mm a")}</td>
                      <td className="text-muted">{event.location ?? "—"}</td>
                      {customFields.map((f) => (
                        <td key={f.id} className="text-muted">
                          {valueByFieldId.get(f.id) ?? "—"}
                        </td>
                      ))}
                      <td>
                        <StatusTag status={event.status} />
                      </td>
                      <td>
                        {event.streamUrl && event.status === "SCHEDULED" ? (
                          <a href={event.streamUrl} target="_blank" rel="noopener noreferrer" className="tag tag-accent">
                            Watch live
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

async function WinLossStandings({
  seasonId,
  divisionId,
  tournament,
}: {
  seasonId: string;
  divisionId?: string | null;
  tournament: Tournament;
}) {
  const standings = await computeStandings(seasonId, divisionId);
  return (
    <section>
      <h4 className="mb-3">Standings</h4>
      {standings.length === 0 ? (
        <p className="text-muted">No results have been posted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mtable">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>School</th>
                <th className="text-right">P</th>
                <th className="text-right">W</th>
                <th className="text-right">L</th>
                <th className="text-right">For</th>
                <th className="text-right">Ag</th>
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
                    {row.schoolName} {row.draws > 0 && <span className="font-normal text-muted">· {row.draws} drawn</span>}
                  </td>
                  <td className="text-right tabular-nums">{row.played}</td>
                  <td className="text-right tabular-nums">{row.wins}</td>
                  <td className="text-right tabular-nums">{row.losses}</td>
                  <td className="text-right tabular-nums">{row.totalScore}</td>
                  <td className="text-right tabular-nums">{row.against}</td>
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
      )}
      <p className="mt-2 text-xs text-muted">
        {tournament.winPoints} pts for a win, {tournament.drawPoints} for a draw, {tournament.lossPoints} for a loss.
      </p>
    </section>
  );
}

async function LowScoreStandings({ seasonId, divisionId }: { seasonId: string; divisionId?: string | null }) {
  const [teams, individuals] = await Promise.all([
    computeLowScoreTeamStandings(seasonId, divisionId),
    computeIndividualStandings(seasonId, divisionId),
  ]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h4 className="mb-3">Team standings</h4>
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
                    <td className="font-extrabold">{row.schoolName}</td>
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
        <h4 className="mb-3">Individual standings</h4>
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
                    <td className="text-muted">{row.schoolName}</td>
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

function StatusTag({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SCHEDULED: "tag-accent",
    COMPLETED: "tag-neutral",
    CANCELLED: "tag-outline",
  };
  return <span className={`tag ${styles[status] ?? "tag-neutral"}`}>{status}</span>;
}
