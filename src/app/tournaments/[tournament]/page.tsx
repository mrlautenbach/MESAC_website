import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TournamentPage({ params }: { params: Promise<{ tournament: string }> }) {
  const { tournament: slug } = await params;
  const activity = await prisma.activity.findUnique({
    where: { slug },
    include: {
      divisions: true,
      tournaments: { orderBy: { startDate: "desc" }, include: { hostSchool: true } },
    },
  });
  if (!activity) notFound();

  const current = activity.tournaments.find((t) => t.isCurrent) ?? activity.tournaments[0];
  const archived = activity.tournaments.filter((t) => t.id !== current?.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-10 sm:px-6">
      <div>
        <h6 className="text-primary-dark">{activity.sport}</h6>
        <h1 className="mt-2 text-4xl sm:text-5xl">{activity.name}</h1>
      </div>

      {!current ? (
        <p className="text-muted">No tournament has been created for this activity yet.</p>
      ) : (
        <section className="border border-divider p-6">
          <h6 className="text-primary-dark">Current tournament</h6>
          <h2 className="mb-2 mt-2">{current.name}</h2>
          <p className="mb-4 text-muted">
            {format(current.startDate, "MMM d, yyyy")} – {format(current.endDate, "MMM d, yyyy")}
            {current.hostSchool && ` · Hosted by ${current.hostSchool.name}`}
          </p>
          <Link href={`/seasons/${current.slug}`} className="btn btn-primary">
            View schedule &amp; results &rarr;
          </Link>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <h4 className="mb-3">Past tournaments</h4>
          <ul>
            {archived.map((tournament) => (
              <li key={tournament.id} className="flex items-center justify-between gap-2 border-b border-divider py-3 last:border-0">
                <div>
                  <Link href={`/seasons/${tournament.slug}`} className="font-bold hover:text-primary">
                    {tournament.name}
                  </Link>
                  <div className="text-sm text-muted">
                    {format(tournament.startDate, "MMM d, yyyy")} – {format(tournament.endDate, "MMM d, yyyy")}
                    {tournament.hostSchool && ` · Hosted by ${tournament.hostSchool.name}`}
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
