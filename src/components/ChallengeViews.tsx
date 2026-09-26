import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { SchoolBadge } from "@/components/SchoolBadge";
import {
  CHALLENGE_GROUPS,
  challengeGroup,
  groupStandings,
  isBowlItem,
  rankChallenge,
  shortChallengeName,
  sortDivisions,
} from "@/lib/academicGames";

// Academic Games' challenge results, per division: the STEM and Humanities
// tables (each school's total score across the group's three challenges),
// then every challenge's own placings.

type School = { id: string; name: string; code: string | null; logoUrl: string | null; themeColor: string | null; themeColorSecondary: string | null };

function SchoolCell({ school }: { school: School }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={school.name}>
      <SchoolBadge size={20} logoUrl={school.logoUrl} name={school.name} color={school.themeColor} secondaryColor={school.themeColorSecondary} />
      <span className="truncate">{school.code || school.name}</span>
    </span>
  );
}

const formatScore = (score: number | null) => (score === null ? "–" : Number.isInteger(score) ? String(score) : score.toFixed(1));

type Challenge = { id: string; title: string; slug: string; date: Date; divisionId: string | null };
type Result = { eventId: string; divisionId: string | null; schoolId: string; place: number | null; score: number | null; school: School };

function DivisionChallenges({ challenges, results, idPrefix }: { challenges: Challenge[]; results: Result[]; idPrefix: string }) {
  const schools = [...new Map(results.map((r) => [r.schoolId, r.school])).values()];
  const groups = CHALLENGE_GROUPS.map((g) => ({ name: g.name, challenges: challenges.filter((c) => challengeGroup(c.title) === g.name) })).filter(
    (g) => g.challenges.length > 0
  );

  return (
    <div className="space-y-8">
      {groups.length > 0 && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {groups.map((group) => {
            const table = groupStandings(schools, group.challenges, results);
            return (
              <section key={group.name}>
                <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
                  <h5>{group.name}</h5>
                  {table.rows.length > 0 && (
                    <span className={`tag ${table.complete ? "tag-neutral" : "tag-outline"}`}>
                      {table.complete ? "Final" : `Provisional · ${table.challengesIn} of ${group.challenges.length} in`}
                    </span>
                  )}
                </div>
                <p className="mb-2 text-sm text-muted">Total score across {group.challenges.map((c) => shortChallengeName(c.title)).join(", ")}.</p>
                {table.rows.length === 0 ? (
                  <p className="text-sm text-muted">No results yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="mtable">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>#</th>
                          <th>School</th>
                          {group.challenges.map((c) => (
                            <th key={c.id} className="text-right" title={c.title}>
                              {shortChallengeName(c.title)}
                            </th>
                          ))}
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row) => {
                          const tied = table.rows.filter((r) => r.place === row.place).length > 1;
                          return (
                            <tr key={row.school.id}>
                              <td className="font-extrabold text-primary-deep tabular-nums">
                                {row.place}
                                {tied ? "=" : ""}
                              </td>
                              <td className="font-semibold">
                                <SchoolCell school={row.school} />
                              </td>
                              {group.challenges.map((c) => (
                                <td key={c.id} className="text-right text-muted tabular-nums">
                                  {formatScore(row.scores.get(c.id) ?? null)}
                                </td>
                              ))}
                              <td className="text-right font-extrabold tabular-nums">{formatScore(row.total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section>
        <h5 className="mb-3">Challenges</h5>
        <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          {challenges.map((challenge) => {
            const own = rankChallenge(results.filter((r) => r.eventId === challenge.id));
            const group = challengeGroup(challenge.title);
            return (
              <article key={challenge.id} id={`${idPrefix}${challenge.slug}`} className="card scroll-mt-28 px-4 py-3">
                <header className="border-b border-divider pb-2">
                  <h6 className="normal-case tracking-normal text-base">{challenge.title}</h6>
                  <p className="text-xs text-muted">
                    {format(challenge.date, "EEE d MMM")}
                    {group && ` · ${group}`}
                  </p>
                </header>
                {own.length === 0 ? (
                  <p className="py-2 text-sm text-muted">Results to come.</p>
                ) : (
                  <ol className="divide-y divide-divider/60">
                    {own.map((r) => (
                      <li key={r.schoolId} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-sm">
                        <span className={`tabular-nums ${r.rank === 1 ? "font-extrabold" : "text-muted"}`}>{r.rank ?? "–"}</span>
                        <span className={r.rank === 1 ? "font-extrabold" : "font-medium"}>
                          <SchoolCell school={r.school} />
                        </span>
                        <span className="tabular-nums text-muted">{formatScore(r.score)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export async function ChallengeResults({ tournamentId, divisionId }: { tournamentId: string; divisionId?: string | null }) {
  const [events, results, divisions] = await Promise.all([
    prisma.event.findMany({ where: { tournamentId, status: { not: "CANCELLED" } }, orderBy: { date: "asc" } }),
    prisma.challengeResult.findMany({ where: { tournamentId }, include: { school: true } }),
    prisma.division.findMany({ where: { tournamentId } }),
  ]);
  const challenges: Challenge[] = events
    .filter((e) => !isBowlItem(e.title ?? ""))
    .map((e) => ({ id: e.id, title: e.title ?? "Challenge", slug: e.slug, date: e.date, divisionId: e.divisionId }));
  if (results.length === 0) return <p className="text-muted">Results will be posted here once the competitions begin.</p>;

  // A division's challenges: its own, and the ones every team sits together.
  const forDivision = (id: string | null) => ({
    challenges: challenges.filter((c) => !c.divisionId || c.divisionId === id),
    results: results.filter((r) => r.divisionId === id),
  });
  if (divisionId) return <DivisionChallenges {...forDivision(divisionId)} idPrefix="" />;
  const shown = sortDivisions(divisions);
  if (shown.length === 0) return <DivisionChallenges {...forDivision(null)} idPrefix="" />;

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
          <DivisionChallenges {...forDivision(division.id)} idPrefix={`${division.slug}-`} />
        </section>
      ))}
    </div>
  );
}
