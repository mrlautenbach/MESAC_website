import { prisma } from "@/lib/prisma";
import { SchoolsMap } from "@/components/SchoolsMap";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
    include: { participants: { include: { event: { include: { tournament: true } } } } },
  });

  const rows = schools.map((s) => {
    const activityIds = new Set(s.participants.map((p) => p.event.tournament.activityId));
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      city: s.city,
      lat: s.lat,
      lon: s.lon,
      teams: activityIds.size,
    };
  });

  const mappable = rows.filter(
    (s): s is typeof s & { code: string; city: string; lat: number; lon: number } =>
      s.code != null && s.city != null && s.lat != null && s.lon != null
  );

  return (
    <div>
      <div className="grid gap-0 sm:grid-cols-[1fr_1.5fr] sm:items-start">
        <div className="border-b-2 border-divider p-8 sm:border-b-0 sm:border-r-2">
          <h6 className="text-primary-dark">Member schools</h6>
          <h2 className="mt-3 mb-3">Six schools, one league table.</h2>
          <p className="text-muted">
            Every marker is placed on its real coordinates — the league&apos;s geography is the reason a MESAC
            weekend means a flight, a host family, and an early bus.
          </p>
          <div className="mhr" />
          <ul>
            {rows.map((s) => (
              <li key={s.id} className="grid grid-cols-[52px_1fr_auto] items-baseline gap-3 border-b border-divider py-3 last:border-0">
                <span className="text-[15px] font-extrabold text-primary-dark">{s.code ?? "—"}</span>
                <span className="text-sm leading-snug">
                  {s.name}
                  <br />
                  <span className="text-[11.5px] text-muted">{s.city ?? "—"}</span>
                </span>
                <span className="text-[11.5px] tabular-nums text-muted">{s.teams} teams</span>
              </li>
            ))}
          </ul>
        </div>
        <SchoolsMap schools={mappable} />
      </div>

      <div className="grid gap-0 border-t-2 border-divider sm:grid-cols-3">
        <div className="border-b border-divider p-6 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">Hosting rota</h6>
          <p className="mt-2 text-sm">Each activity&apos;s host school is set on its tournament page — nobody hosts every year.</p>
        </div>
        <div className="border-b border-divider p-6 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">Travel</h6>
          <p className="mt-2 text-sm">Dates and host details live on each activity&apos;s tournament page.</p>
        </div>
        <div className="p-6">
          <h6 className="text-primary-dark">New school?</h6>
          <p className="mt-2 text-sm">Contact the league admin about associate membership.</p>
        </div>
      </div>
    </div>
  );
}
