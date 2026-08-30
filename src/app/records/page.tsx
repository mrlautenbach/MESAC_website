import Image from "next/image";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const [records, hofEntries] = await Promise.all([
    prisma.record.findMany({ orderBy: [{ sport: "asc" }, { eventName: "asc" }], include: { school: true } }),
    prisma.hallOfFameEntry.findMany({ orderBy: { classYear: "desc" }, include: { school: true } }),
  ]);

  const longestStanding = records.length > 0 ? records.reduce((a, b) => (a.year < b.year ? a : b)) : null;
  const earliestYear = records.length > 0 ? Math.min(...records.map((r) => r.year)) : null;

  return (
    <div>
      <div className="grid gap-0 border-b-2 border-divider sm:grid-cols-2">
        <div className="p-8 sm:border-r-2 sm:border-divider">
          <h6 className="text-primary-dark">{earliestYear ? `Since ${earliestYear}` : "League records"}</h6>
          <h1 className="mt-3 text-4xl sm:text-5xl">Records &amp; Hall of Fame</h1>
          <p className="mt-3 text-muted">
            Marks stand until a MESAC championship beats them. Every entry is verified by the host school&apos;s
            meet officials.
          </p>
        </div>
        <div className="relative overflow-hidden bg-surface p-8">
          <div className="lattice-panel absolute inset-0 opacity-10" />
          {longestStanding ? (
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
          ) : (
            <p className="relative text-muted">No records logged yet — check back once a season is underway.</p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h4 className="mb-3">League records</h4>
        {records.length === 0 ? (
          <p className="text-muted">No records have been logged yet.</p>
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
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h4 className="mb-4">Hall of Fame</h4>
          {hofEntries.length === 0 ? (
            <p className="text-muted">No inductees yet.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-3">
              {hofEntries.map((h) => (
                <div key={h.id} className="border border-divider">
                  <div className="relative flex h-[150px] items-center justify-center bg-foreground/10 text-center">
                    {h.photoUrl ? (
                      <Image src={h.photoUrl} alt={h.name} fill className="object-cover grayscale contrast-[1.08]" />
                    ) : (
                      <span className="px-4 text-[11px] tracking-[0.1em] text-muted">PORTRAIT</span>
                    )}
                  </div>
                  <div className="border-t border-divider p-4">
                    <div className="text-[10px] tracking-[0.12em] text-primary-dark">CLASS OF {h.classYear}</div>
                    <div className="mt-1.5 text-lg font-extrabold">{h.name}</div>
                    <p className="mt-1.5 text-sm text-muted">{h.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
