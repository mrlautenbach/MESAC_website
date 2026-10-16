import { prisma } from "@/lib/prisma";
import type { School } from "@/generated/prisma";

// Every school by its name and by its short code, lowercased - how a CSV
// upload's school cells are matched ("DAA" or "Dubai American Academy").
// An "American School of X" is also found as "ASX" ("ASDubai", "ASDoha"),
// as the league's sheets write it, whatever its code is.
export async function loadSchoolKeys() {
  const schools = await prisma.school.findMany();
  const byKey = new Map<string, School>();
  for (const s of schools) {
    byKey.set(s.name.trim().toLowerCase(), s);
    if (s.code) byKey.set(s.code.trim().toLowerCase(), s);
  }
  for (const s of schools) {
    const place = s.name.trim().match(/^american school of (.+)$/i)?.[1].toLowerCase();
    if (place && !byKey.has(`as${place}`)) byKey.set(`as${place}`, s);
  }
  return { schools, byKey, find: (raw: string) => byKey.get(raw.trim().toLowerCase()) };
}

export type FindSchool = Awaited<ReturnType<typeof loadSchoolKeys>>["find"];
