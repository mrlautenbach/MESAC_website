import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const [records, schoolYears] = await Promise.all([
    prisma.record.findMany({ orderBy: [{ sport: "asc" }, { eventName: "asc" }], include: { school: true } }),
    prisma.schoolYearArchive.findMany({ orderBy: { startYear: "desc" } }),
  ]);

  // Years without an uploaded results document are just empty links - list
  // only the ones that actually lead somewhere.
  const archivedYears = schoolYears.filter((y) => y.resultsUrl);

  const longestStanding = records.length > 0 ? records.reduce((a, b) => (a.year < b.year ? a : b)) : null;
  const earliestYear = records.length > 0 ? Math.min(...records.map((r) => r.year)) : null;

  return (
    <div>
      <div className="border-b-2 border-divider">
      <div className={`page-wrap grid gap-0 ${longestStanding ? "sm:grid-cols-2" : ""}`}>
        <div className={`py-8 ${longestStanding ? "sm:border-r-2 sm:border-divider sm:pr-8" : ""}`}>
          <h6 className="text-primary-dark">{earliestYear ? `Since ${earliestYear}` : "League records"}</h6>
          <h1 className="mt-3 text-4xl sm:text-5xl">History</h1>
          <p className="mt-3 text-muted">
            Marks stand until a MESAC championship beats them. Every entry is verified by the host school&apos;s
            meet officials.
          </p>
        </div>
        {longestStanding && (
          <div className="relative overflow-hidden bg-surface p-8">
            <div className="lattice-panel absolute inset-0 opacity-10" />
            <div className="relative">
              <h6 className="text-primary-dark">Longest-standing record</h6>
              <div className="mt-2 text-5xl font-extrabold leading-[.95] tracking-tight sm:text-6xl">
                {longestStanding.mark}
              </div>
              <p className="mt-3 text-sm">
                <b>{longestStanding.eventName}</b> · {longestStanding.athleteName}
                {longestStanding.school ? `, ${longestStanding.school.name}` : ""} · {longestStanding.year}
              </p>
            </div>
          </div>
        )}
      </div>
      </div>

      <div className="page-wrap py-8">
        <h4 className="mb-3">League records</h4>
        {records.length === 0 ? (
          <p className="text-muted">No records logged yet. Check back once a season is underway.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mtable">
              <thead>
                <tr>
                  <th>Sport</th>
                  <th>Event</th>
                  <th>Mark</th>
                  <th>Athlete</th>
                  <th>School</th>
                  <th className="text-right">Set</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="text-muted">{r.sport}</td>
                    <td>{r.eventName}</td>
                    <td className="text-[17px] font-extrabold tabular-nums">{r.mark}</td>
                    <td>{r.athleteName}</td>
                    <td className="text-muted">{r.school?.name ?? "—"}</td>
                    <td className="text-right tabular-nums">{r.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t-2 border-divider">
        <div className="page-wrap py-8">
          <h4 className="mb-1">Previous years&apos; results</h4>
          <p className="mb-4 text-sm text-muted">Full results archive by school year.</p>
          {archivedYears.length === 0 ? (
            <p className="text-muted">No past years have been added yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              {archivedYears.map((y) => (
                <li key={y.id}>
                  <Link href={`/records/${y.startYear}-${y.startYear + 1}`} className="block py-1.5 hover:text-primary">
                    {y.startYear}-{y.startYear + 1}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
