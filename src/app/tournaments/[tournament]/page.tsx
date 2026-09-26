import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateRange } from "@/lib/dates";

export async function generateMetadata({ params }: { params: Promise<{ tournament: string }> }) {
  const { tournament } = await params;
  const activity = await prisma.activity.findUnique({ where: { slug: tournament }, select: { name: true } });
  return { title: activity?.name ?? "Tournament" };
}

export const dynamic = "force-dynamic";

export default async function TournamentPage({ params }: { params: Promise<{ tournament: string }> }) {
  const { tournament: slug } = await params;
  const activity = await prisma.activity.findUnique({
    where: { slug },
    include: {
      divisions: true,
      // Non-archived editions first, archived ones after - each group
      // newest-first by date. Keeps this newest-on-top even in the rare
      // case an admin archives a tournament out of date order.
      tournaments: { orderBy: [{ archived: "asc" }, { startDate: "desc" }], include: { hostSchool: true } },
    },
  });
  if (!activity) notFound();

  const current = activity.tournaments.find((t) => t.isCurrent) ?? activity.tournaments[0];
  const archived = activity.tournaments.filter((t) => t.id !== current?.id);

  return (
    <div className="page-wrap space-y-10 py-8 [&>*]:max-w-4xl">
      <div>
        <p className="eyebrow text-primary-dark">{activity.sport}</p>
        <h1 className="mt-2 text-4xl sm:text-5xl">{activity.name}</h1>
      </div>

      {!current ? (
        <p className="text-muted">No tournament has been created for this activity yet.</p>
      ) : (
        <section className="border border-divider p-6">
          <h6 className="text-primary-dark">Current tournament</h6>
          <h2 className="mb-2 mt-2">{current.name}</h2>
          <p className="mb-4 text-muted">
            {formatDateRange(current.startDate, current.endDate)}
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
                    {formatDateRange(tournament.startDate, tournament.endDate)}
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
