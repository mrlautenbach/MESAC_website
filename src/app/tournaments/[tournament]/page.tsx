import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentPage({ params }: { params: Promise<{ tournament: string }> }) {
  const { tournament: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      divisions: true,
      seasons: { orderBy: { startDate: "desc" }, include: { hostSchool: true } },
    },
  });
  if (!tournament) notFound();

  const current = tournament.seasons.find((s) => s.isCurrent) ?? tournament.seasons[0];
  const archived = tournament.seasons.filter((s) => s.id !== current?.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-10 sm:px-6">
      <div>
        <h6 className="text-primary-dark">{tournament.sport}</h6>
        <h1 className="mt-2 text-4xl sm:text-5xl">{tournament.name}</h1>
      </div>

      {!current ? (
        <p className="text-muted">No season has been created for this tournament yet.</p>
      ) : (
        <section className="border border-divider p-6">
          <h6 className="text-primary-dark">Current season</h6>
          <h2 className="mb-2 mt-2">{current.name}</h2>
          <p className="mb-4 text-muted">
            {format(current.startDate, "MMM d, yyyy")} – {format(current.endDate, "MMM d, yyyy")}
            {current.hostSchool && ` · Hosted by ${current.hostSchool.name}`}
          </p>
          <Link href={`/seasons/${current.slug}`} className="btn btn-primary">
            View schedule &amp; standings &rarr;
          </Link>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h4 className="mb-3">Past seasons</h4>
          <ul>
            {archived.map((season) => (
              <li key={season.id} className="flex items-center justify-between gap-2 border-b border-divider py-3 last:border-0">
                <div>
                  <Link href={`/seasons/${season.slug}`} className="font-bold hover:text-primary">
                    {season.name}
                  </Link>
                  <div className="text-sm text-muted">
                    {format(season.startDate, "MMM d, yyyy")} – {format(season.endDate, "MMM d, yyyy")}
                    {season.hostSchool && ` · Hosted by ${season.hostSchool.name}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
