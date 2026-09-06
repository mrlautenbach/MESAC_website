import { prisma } from "@/lib/prisma";
import { SchoolsMap } from "@/components/SchoolsMap";
import { SchoolBadge } from "@/components/SchoolBadge";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });

  const rows = schools.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    city: s.city,
    lat: s.lat,
    lon: s.lon,
    themeColor: s.themeColor,
    themeColorSecondary: s.themeColorSecondary,
    logoUrl: s.logoUrl,
    teams: s.teamCount,
  }));

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
            MESAC schools are spread across the Middle East and South Asia, coming together for the highest level
            International School Tournaments in the region.
          </p>
          <div className="mhr" />
          <ul>
            {rows.map((s) => (
              <li
                key={s.id}
                className="grid grid-cols-[92px_48px_1fr_auto] items-center border-b border-divider py-4 last:border-0"
              >
                <span className="whitespace-nowrap text-[15px] font-extrabold text-primary-dark">{s.code ?? "—"}</span>
                <span className="ml-1 flex items-center justify-center">
                  <SchoolBadge
                    logoUrl={s.logoUrl}
                    name={s.name}
                    color={s.themeColor}
                    secondaryColor={s.themeColorSecondary}
                    size={40}
                  />
                </span>
                <span className="ml-2 text-sm leading-snug">
                  {s.name}
                  <br />
                  <span className="text-[11.5px] text-muted">{s.city ?? "—"}</span>
                </span>
                <span className="ml-3 text-[11.5px] tabular-nums text-muted">{s.teams} teams</span>
              </li>
            ))}
          </ul>
        </div>
        <SchoolsMap schools={mappable} />
      </div>

      <div className="grid gap-0 border-t-2 border-divider sm:grid-cols-2">
        <div className="border-b border-divider p-6 sm:border-b-0 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">Hosting rota</h6>
          <p className="mt-2 text-sm">Each activity&apos;s host school is set on its tournament page.</p>
        </div>
        <div className="p-6">
          <h6 className="text-primary-dark">Travel</h6>
          <p className="mt-2 text-sm">Dates and host details live on each activity&apos;s tournament page.</p>
        </div>
      </div>
    </div>
  );
}
