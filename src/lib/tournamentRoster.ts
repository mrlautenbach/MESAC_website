import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

// Which schools are taking part in one tournament.
//
// There is no backfill and no "roster not set up yet" state: a TournamentSchool
// row exists only once an admin has moved a school off its default, and the
// default is the school's own league membership. So a brand-new tournament
// starts with every league member in and every guest school out, which is
// exactly what an admin would have picked anyway.
//
// Everything that needs to know "who is in this tournament" resolves it here,
// so the public team-photo board, the admin screens and the tournament page
// can't drift apart.

export type RosterSchool = {
  id: string;
  name: string;
  logoUrl: string | null;
  themeColor: string | null;
  themeColorSecondary: string | null;
  isLeagueMember: boolean;
};

const ROSTER_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
  themeColor: true,
  themeColorSecondary: true,
  isLeagueMember: true,
} as const;

export function isParticipating(
  school: { id: string; isLeagueMember: boolean },
  overrides: Map<string, boolean>
): boolean {
  return overrides.get(school.id) ?? school.isLeagueMember;
}

/** Every school in the system, each flagged with whether it's in this
 *  tournament - for the admin picker, which has to show the ones that are out
 *  so they can be ticked back in. */
export async function loadRosterOptions(tournamentId: string): Promise<(RosterSchool & { participating: boolean })[]> {
  const [schools, rows] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: "asc" }, select: ROSTER_SELECT }),
    prisma.tournamentSchool.findMany({ where: { tournamentId }, select: { schoolId: true, participating: true } }),
  ]);
  const overrides = new Map(rows.map((r) => [r.schoolId, r.participating]));
  return schools.map((school) => ({ ...school, participating: isParticipating(school, overrides) }));
}

/** Just the participating schools, name-ordered - for the public pages. */
export async function loadRoster(tournamentId: string): Promise<RosterSchool[]> {
  const options = await loadRosterOptions(tournamentId);
  return options.filter((s) => s.participating);
}

/** Put schools into a tournament's roster because they're actually playing in
 *  it. Attaching a participant to an event is the strongest possible statement
 *  that a school is taking part, so it wins over a stale roster rather than
 *  failing - this is what keeps a mid-season CSV import from ever being
 *  rejected over a tick box. Only ever adds; never removes. */
export async function ensureInRoster(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  schoolIds: string[]
): Promise<void> {
  const unique = [...new Set(schoolIds)].filter(Boolean);
  if (unique.length === 0) return;
  await tx.tournamentSchool.createMany({
    data: unique.map((schoolId) => ({ tournamentId, schoolId, participating: true })),
    skipDuplicates: true,
  });
  // createMany's skipDuplicates leaves an existing participating:false row
  // alone, so flip those explicitly.
  await tx.tournamentSchool.updateMany({
    where: { tournamentId, schoolId: { in: unique }, participating: false },
    data: { participating: true },
  });
}
