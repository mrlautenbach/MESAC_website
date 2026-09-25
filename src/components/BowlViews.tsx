import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SchoolBadge } from "@/components/SchoolBadge";
import { sortDivisions } from "@/lib/academicGames";
import { FINALS_STAGES, gameCode, sourceLabel, teamLabel, type BowlStage } from "@/lib/bowl";

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

function DivisionSchedule({ games, idPrefix }: { games: Game[]; idPrefix: string }) {
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
    const day = format(card.games[0].startTime, "yyyy-MM-dd");
    days.set(day, [...(days.get(day) ?? []), card]);
  }

  return (
    <div className="space-y-8">
      {[...days.entries()].map(([day, dayCards]) => (
        <section key={day}>
          <h6 className="mb-3 text-muted">{format(dayCards[0].games[0].startTime, "EEEE d MMMM")}</h6>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {dayCards.map((card) => {
              const times = [...new Set(card.games.map((g) => format(g.startTime, "h:mmaaa")))];
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

export async function BowlSchedule({ tournamentId, divisionId }: { tournamentId: string; divisionId?: string | null }) {
  const [games, divisions] = await Promise.all([
    loadGames(tournamentId, divisionId),
    prisma.division.findMany({ where: { tournamentId } }),
  ]);
  if (games.length === 0) return <p className="text-sm text-muted">The Academic Bowl schedule hasn&apos;t been posted yet.</p>;
  if (divisionId) return <DivisionSchedule games={games} idPrefix="" />;

  // Both divisions: one after the other, with a jump to the second.
  const shown = sortDivisions(divisions).filter((d) => games.some((g) => g.divisionId === d.id));
  return (
    <div className="space-y-12">
      {shown.length > 1 && (
        <p className="text-sm text-muted">
          Jump to{" "}
          {shown.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              <a href={`#${d.slug}`} className="font-semibold text-primary hover:underline">
                {d.name}
              </a>
            </span>
          ))}
        </p>
      )}
      {shown.map((division) => (
        <section key={division.id} id={division.slug} className="scroll-mt-28 space-y-4">
          <h4>{division.name}</h4>
          <DivisionSchedule games={games.filter((g) => g.divisionId === division.id)} idPrefix={`${division.slug}-`} />
        </section>
      ))}
    </div>
  );
}
