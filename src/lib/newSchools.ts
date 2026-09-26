import type { Prisma } from "@/generated/prisma";
import { recordAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";

// Adds the schools an import file names that aren't in the database yet.
// They go in as guest schools, so a visiting team shows up wherever it plays
// without being listed as a league member; an admin can fill in a code, logo
// and colors (or make it a member) later from Schools.
//
// Returns the new schools keyed by lowercased name, the same key the
// importers use to look a school up.
export async function createGuestSchools(
  tx: Prisma.TransactionClient,
  names: string[],
  actor: { id: string; name: string }
): Promise<Map<string, { id: string; slug: string; name: string }>> {
  const created = new Map<string, { id: string; slug: string; name: string }>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || created.has(key)) continue;

    const base = slugify(key, 60) || "school";
    let slug = base;
    let suffix = 1;
    while (await tx.school.findUnique({ where: { slug }, select: { id: true } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    const school = await tx.school.create({
      data: { name: name.trim(), slug, isLeagueMember: false },
      select: { id: true, slug: true, name: true },
    });
    await recordAudit(
      {
        actorId: actor.id,
        actorLabel: actor.name,
        action: "SCHOOL_CREATE",
        entityType: "School",
        entityId: school.id,
        summary: `${actor.name} added guest school "${school.name}" from a CSV import`,
        after: { name: school.name, isLeagueMember: false },
      },
      tx
    );
    created.set(key, school);
  }
  return created;
}
