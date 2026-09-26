import { prisma } from "@/lib/prisma";
import { SchoolBadge } from "@/components/SchoolBadge";
import { sortDivisions } from "@/lib/academicGames";
import {
  FINALS_STAGES,
  bowlStandings,
  gameCode,
  gameLabel,
  gameResult,
  roundRobinComplete,
  sourceLabel,
  teamLabel,
  type BowlStage,
} from "@/lib/bowl";
import { DivisionSections } from "@/components/DivisionSections";
import type { Clock } from "@/lib/timeZones";

// The Academic Bowl's schedule: each division's games day by day, one card
// per round-robin round and one per finals stage, every game a row with its
// room, the two teams and - once played - the score, winner in bold.

const STAGE_ORDER: BowlStage[] = ["ROUND_ROBIN", ...FINALS_STAGES.map((f) => f.stage)];

// Where the schedule's "Academic Bowl Rounds 7-12" or "Academic Bowl
// Semifinals" item jumps to on the Bowl side - the card's id.
export function bowlAnchor(title: string): string | null {
  if (!/bowl/i.test(title)) return null;
  const rounds = title.match(/rounds?\s+(\d+)/i);
  if (rounds) return `round-${Number(rounds[1])}`;
  if (/quarter/i.test(title)) return "quarterfinals";
  if (/semi/i.test(title)) return "semifinals";
  if (/consolation/i.test(title)) return "consolation";
  if (/\bfinal\b/i.test(title)) return "final";
  return null;
}

function cardAnchor(stage: BowlStage, number: number): string {
  if (stage === "ROUND_ROBIN") return `round-${number}`;
  return { QUARTERFINAL: "quarterfinals", SEMIFINAL: "semifinals", CONSOLATION: "consolation", FINAL: "final" }[stage];
}

function cardTitle(stage: BowlStage, number: number): string {
  if (stage === "ROUND_ROBIN") return `Round ${number}`;
  const label = FINALS_STAGES.find((f) => f.stage === stage)!.label;
  return stage === "QUARTERFINAL" || stage === "SEMIFINAL" ? `${label}s` : label;
}

async function loadGames(tournamentId: string, divisionId?: string | null) {
  return prisma.bowlGame.findMany({
    where: { tournamentId, ...(divisionId ? { divisionId } : {}) },
    orderBy: [{ startTime: "asc" }, { number: "asc" }],
    include: { teamA: { include: { school: true } }, teamB: { include: { school: true } } },
  });
}
type Game = Awaited<ReturnType<typeof loadGames>>[number];

function Side({ team, source, won, align }: { team: Game["teamA"]; source: string | null; won: boolean; align: "left" | "right" }) {
  if (!team) {
    return (
      <span className={`truncate text-sm text-muted italic ${align === "right" ? "text-right" : ""}`}>
        {source ? sourceLabel(source) : "TBD"}
      </span>
    );
  }
  const label = teamLabel(team);
  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 text-sm ${align === "right" ? "flex-row-reverse text-right" : ""} ${won ? "font-extrabold" : "font-medium"}`}
      title={`${team.school.name}${team.name ? ` ${team.name}` : ""}`}
    >
      <SchoolBadge size={20} logoUrl={team.school.logoUrl} name={team.school.name} color={team.school.themeColor} secondaryColor={team.school.themeColorSecondary} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function GameRow({ game }: { game: Game }) {
  const played = game.scoreA !== null && game.scoreB !== null;
  const aWon = played && game.scoreA! > game.scoreB!;
  const bWon = played && game.scoreB! > game.scoreA!;
  const finals = game.stage !== "ROUND_ROBIN";
  return (
    <li className="grid grid-cols-[3.25rem_minmax(0,1fr)_1.75rem_0.5rem_1.75rem_minmax(0,1fr)] items-center gap-x-1.5 py-2">
      <span className={`truncate text-xs ${finals ? "font-semibold" : "text-muted"}`} title={game.room ?? undefined}>
        {/* A finals game is known by its code (QF1, SF2) - its room goes on a
            line of its own below, as they're often longer ("HS Black Box"). */}
        {finals ? (FINALS_STAGES.find((f) => f.stage === game.stage)!.games > 1 ? gameCode(game.stage, game.number) : "") : (game.room ?? "")}
      </span>
      <span className="flex min-w-0 justify-end">
        <Side team={game.teamA} source={game.sourceA} won={aWon} align="right" />
      </span>
      <span className={`text-right tabular-nums ${aWon ? "font-extrabold" : "text-muted"}`}>{played ? game.scoreA : ""}</span>
      <span className="text-center text-muted">{played ? "–" : "v"}</span>
      <span className={`tabular-nums ${bWon ? "font-extrabold" : "text-muted"}`}>{played ? game.scoreB : ""}</span>
      <Side team={game.teamB} source={game.sourceB} won={bWon} align="left" />
      {finals && game.room && <span className="col-span-full text-center text-xs text-muted">{game.room}</span>}
    </li>
  );
}

function DivisionSchedule({ games, idPrefix, clock }: { games: Game[]; idPrefix: string; clock: Clock }) {
  // One card per round (or finals stage), in play order, grouped by day.
  const cards = new Map<string, { stage: BowlStage; number: number; games: Game[] }>();
  for (const game of games) {
    const key = game.stage === "ROUND_ROBIN" ? `RR${game.number}` : game.stage;
    const card = cards.get(key) ?? { stage: game.stage, number: game.number, games: [] };
    card.games.push(game);
    cards.set(key, card);
  }
  const ordered = [...cards.values()].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.number - b.number
  );
  for (const card of ordered) {
    card.games.sort((a, b) => a.number - b.number || (a.room ?? "").localeCompare(b.room ?? "", undefined, { numeric: true }));
  }
  const days = new Map<string, typeof ordered>();
  for (const card of ordered) {
    const day = clock.format(card.games[0].startTime, "yyyy-MM-dd");
    days.set(day, [...(days.get(day) ?? []), card]);
  }

  return (
    <div className="space-y-8">
      {[...days.entries()].map(([day, dayCards]) => (
        <section key={day}>
          <h6 className="mb-3 text-muted">{clock.format(dayCards[0].games[0].startTime, "EEEE d MMMM")}</h6>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {dayCards.map((card) => {
              const times = [...new Set(card.games.map((g) => clock.format(g.startTime, "h:mmaaa")))];
              const scored = card.games.filter((g) => g.scoreA !== null).length;
              return (
                <article key={`${card.stage}-${card.number}`} id={`${idPrefix}${cardAnchor(card.stage, card.number)}`} className="card scroll-mt-28 px-4 py-3">
                  <header className="flex items-baseline justify-between gap-3 border-b border-divider pb-2">
                    <h5>{cardTitle(card.stage, card.number)}</h5>
                    <span className="text-sm text-muted tabular-nums">
                      {times.join(", ")}
                      {scored === card.games.length && " · Final scores"}
                    </span>
                  </header>
                  <ul className="divide-y divide-divider/60">
                    {card.games.map((game) => (
                      <GameRow key={game.id} game={game} />
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export async function BowlSchedule({ tournamentId, divisionId, clock }: { tournamentId: string; divisionId?: string | null; clock: Clock }) {
  const [games, divisions] = await Promise.all([
    loadGames(tournamentId, divisionId),
    prisma.division.findMany({ where: { tournamentId } }),
  ]);
  if (games.length === 0) return <p className="text-sm text-muted">The Academic Bowl schedule hasn&apos;t been posted yet.</p>;
  if (divisionId) return <DivisionSchedule games={games} idPrefix="" clock={clock} />;

  // Both divisions: one after the other, with a jump to the second.
  const shown = sortDivisions(divisions).filter((d) => games.some((g) => g.divisionId === d.id));
  return (
    <DivisionSections divisions={shown}>
      {(division) => (
        <DivisionSchedule games={games.filter((g) => g.divisionId === division.id)} idPrefix={`${division.slug}-`} clock={clock} />
      )}
    </DivisionSections>
  );
}

// ── Results: standings and the finals bracket ──────────────────────────

const SEEDS_THROUGH = 8;

async function loadTeams(tournamentId: string, divisionId?: string | null) {
  return prisma.bowlTeam.findMany({
    where: { tournamentId, ...(divisionId ? { divisionId } : {}) },
    include: { school: true },
  });
}
type Team = Awaited<ReturnType<typeof loadTeams>>[number];

function TeamCell({ team }: { team: Team }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`${team.school.name}${team.name ? ` ${team.name}` : ""}`}>
      <SchoolBadge size={20} logoUrl={team.school.logoUrl} name={team.school.name} color={team.school.themeColor} secondaryColor={team.school.themeColorSecondary} />
      <span className="truncate">{teamLabel(team)}</span>
    </span>
  );
}

function BracketGame({ game, clock }: { game: Game | undefined; clock: Clock }) {
  if (!game) return null;
  const result = gameResult(game);
  const line = (team: Game["teamA"], source: string | null, score: number | null) => {
    const won = !!team && result?.winner === team.id;
    return (
      <div className={`flex items-center justify-between gap-2 py-1 text-sm ${won ? "font-extrabold" : ""}`}>
        {team ? (
          <span className="min-w-0">
            <TeamCell team={team as Team} />
          </span>
        ) : (
          <span className="truncate text-muted italic">{source ? sourceLabel(source) : "TBD"}</span>
        )}
        <span className={`tabular-nums ${won ? "" : "text-muted"}`}>{score ?? ""}</span>
      </div>
    );
  };
  return (
    <div className="card px-3 py-2">
      <div className="flex justify-between gap-2 text-xs text-muted">
        <span className="font-semibold text-foreground">{gameLabel(game.stage, game.number)}</span>
        <span className="truncate">
          {clock.format(game.startTime, "EEE h:mmaaa")}
          {game.room && ` · ${game.room}`}
        </span>
      </div>
      <div className="divide-y divide-divider/60">
        {line(game.teamA, game.sourceA, game.scoreA)}
        {line(game.teamB, game.sourceB, game.scoreB)}
      </div>
    </div>
  );
}

function DivisionResults({ teams, games, clock }: { teams: Team[]; games: Game[]; clock: Clock }) {
  const table = bowlStandings(
    teams.map((t) => ({ ...t, label: teamLabel(t) })),
    games
  );
  const complete = roundRobinComplete(games);
  const robin = games.filter((g) => g.stage === "ROUND_ROBIN");
  const scored = robin.filter((g) => g.scoreA !== null).length;
  const anyDraws = table.some((r) => r.draws > 0);
  const finals = (stage: BowlStage) => games.filter((g) => g.stage === stage).sort((a, b) => a.number - b.number);
  const final = finals("FINAL")[0];
  const consolation = finals("CONSOLATION")[0];
  const champion = final ? gameResult(final) : null;
  const third = consolation ? gameResult(consolation) : null;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const hasFinals = games.some((g) => g.stage !== "ROUND_ROBIN");

  return (
    <div className="space-y-8">
      {champion && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-2">
            <span className="tag tag-accent">Champion</span>
            <span className="font-extrabold">
              <TeamCell team={teamById.get(champion.winner)!} />
            </span>
          </span>
          <span className="text-muted">Runner-up {teamLabel(teamById.get(champion.loser)!)}</span>
          {third && <span className="text-muted">Third {teamLabel(teamById.get(third.winner)!)}</span>}
        </p>
      )}

      <section>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
          <h5>Standings</h5>
          <span className={`tag ${complete ? "tag-neutral" : "tag-outline"}`}>{complete ? "Final" : "Provisional"}</span>
        </div>
        <p className="mb-3 text-sm text-muted">
          {complete ? "The round robin is complete" : `${scored} of ${robin.length} round-robin games scored`} - ranked by wins,
          then points scored. The top {SEEDS_THROUGH} go through to the Quarterfinals.
        </p>
        {table.length === 0 ? (
          <p className="text-sm text-muted">No teams yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mtable">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Team</th>
                  <th className="text-right">P</th>
                  <th className="text-right">W</th>
                  {anyDraws && <th className="text-right">D</th>}
                  <th className="text-right">L</th>
                  <th className="text-right">For</th>
                  <th className="text-right">Ag</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row, i) => {
                  const tied = table.filter((r) => r.place === row.place).length > 1;
                  return (
                    <tr key={row.team.id} className={i === SEEDS_THROUGH - 1 && table.length > SEEDS_THROUGH ? "border-b-2 border-foreground/40" : undefined}>
                      <td className="font-extrabold text-primary-deep tabular-nums">
                        {row.played > 0 ? `${row.place}${tied ? "=" : ""}` : "–"}
                      </td>
                      <td className="font-semibold">
                        <TeamCell team={row.team} />
                      </td>
                      <td className="text-right tabular-nums">{row.played}</td>
                      <td className="text-right font-extrabold tabular-nums">{row.wins}</td>
                      {anyDraws && <td className="text-right tabular-nums">{row.draws}</td>}
                      <td className="text-right tabular-nums">{row.losses}</td>
                      <td className="text-right tabular-nums">{row.pointsFor}</td>
                      <td className="text-right tabular-nums">{row.pointsAgainst}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {hasFinals && (
        <section>
          <h5 className="mb-3">Finals</h5>
          <div className="grid items-center gap-4 md:grid-cols-3">
            <div className="space-y-3">
              <h6 className="text-muted">Quarterfinals</h6>
              {finals("QUARTERFINAL").map((g) => (
                <BracketGame key={g.id} game={g} clock={clock} />
              ))}
            </div>
            <div className="space-y-3">
              <h6 className="text-muted">Semifinals</h6>
              {finals("SEMIFINAL").map((g) => (
                <BracketGame key={g.id} game={g} clock={clock} />
              ))}
            </div>
            <div className="space-y-3">
              <h6 className="text-muted">Final</h6>
              <BracketGame game={final} clock={clock} />
              {consolation && (
                <>
                  <h6 className="pt-2 text-muted">Consolation</h6>
                  <BracketGame game={consolation} clock={clock} />
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export async function BowlResults({ tournamentId, divisionId, clock }: { tournamentId: string; divisionId?: string | null; clock: Clock }) {
  const [games, teams, divisions] = await Promise.all([
    loadGames(tournamentId, divisionId),
    loadTeams(tournamentId, divisionId),
    prisma.division.findMany({ where: { tournamentId } }),
  ]);
  if (games.length === 0) return <p className="text-muted">The Academic Bowl hasn&apos;t started yet.</p>;
  if (divisionId) return <DivisionResults teams={teams} games={games} clock={clock} />;

  const shown = sortDivisions(divisions).filter((d) => games.some((g) => g.divisionId === d.id));
  return (
    <DivisionSections divisions={shown}>
      {(division) => (
        <DivisionResults
          teams={teams.filter((t) => t.divisionId === division.id)}
          games={games.filter((g) => g.divisionId === division.id)}
          clock={clock}
        />
      )}
    </DivisionSections>
  );
}
