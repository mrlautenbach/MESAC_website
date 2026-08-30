import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentsIndexPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: [{ name: "asc" }],
    include: { seasons: { where: { isCurrent: true }, take: 1 } },
  });

  const groups = new Map<string, typeof tournaments>();
  for (const t of tournaments) {
    const group = groups.get(t.sport) ?? [];
    group.push(t);
    groups.set(t.sport, group);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h6 className="text-primary-dark">Season standings</h6>
      <h1 className="mt-2 mb-8 text-4xl sm:text-5xl">Every tournament, one table each.</h1>

      <div className="space-y-3">
        {Array.from(groups.entries()).map(([sport, group]) => (
          <div key={sport} className="border-b border-divider py-3">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[160px_1fr]">
              <h6 className="pt-1 text-muted">{sport}</h6>
              <ul className="flex flex-wrap gap-2">
                {group.map((t) => {
                  const current = t.seasons[0];
                  return (
                    <li key={t.id}>
                      <Link href={current ? `/seasons/${current.slug}` : `/tournaments/${t.slug}`} className="btn btn-secondary">
                        {t.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {tournaments.length === 0 && <p className="text-muted">No tournaments have been created yet.</p>}
    </div>
  );
}
