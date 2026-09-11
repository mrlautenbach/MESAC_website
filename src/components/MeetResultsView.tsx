"use client";

import { useState } from "react";

type MeetResultRow = {
  id: string;
  place: number | null;
  athleteName: string;
  schoolName: string;
  mark: string;
  seedMark: string | null;
  prelimMark: string | null;
  points: number | null;
  recordNotation: string | null;
};

type MeetResultGroup = {
  eventName: string;
  plannedRounds: { prelim: boolean; final: boolean };
  prelim: MeetResultRow[];
  final: MeetResultRow[];
};

export function MeetResultsView({ groups }: { groups: MeetResultGroup[] }) {
  const hasPrelim = groups.some((g) => g.prelim.length > 0 || g.plannedRounds.prelim);
  const hasFinal = groups.some((g) => g.final.length > 0 || g.plannedRounds.final);
  const [round, setRound] = useState<"prelim" | "final">(hasFinal ? "final" : "prelim");

  const visibleGroups = groups
    .map((g) => ({
      eventName: g.eventName,
      rows: round === "prelim" ? g.prelim : g.final,
      planned: round === "prelim" ? g.plannedRounds.prelim : g.plannedRounds.final,
    }))
    .filter((g) => g.rows.length > 0 || g.planned);

  return (
    <div className="space-y-6">
      {hasPrelim && hasFinal && (
        <div className="inline-flex rounded-md border border-border">
          <button
            type="button"
            onClick={() => setRound("prelim")}
            className={`px-3 py-1.5 text-sm font-semibold ${round === "prelim" ? "bg-primary text-background" : "text-muted"}`}
          >
            Preliminary
          </button>
          <button
            type="button"
            onClick={() => setRound("final")}
            className={`px-3 py-1.5 text-sm font-semibold ${round === "final" ? "bg-primary text-background" : "text-muted"}`}
          >
            Final
          </button>
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <p className="text-muted">
          No {round === "prelim" ? "preliminary" : "final"} results have been posted yet.
        </p>
      ) : (
        visibleGroups.map((group) => {
          // Reference time is contextual: a prelim row's own seed time, or a
          // final row's prior prelim time - only shown when at least one row
          // in this group actually has it.
          const refKey = round === "prelim" ? "seedMark" : "prelimMark";
          const refLabel = round === "prelim" ? "Seed" : "Prelim";
          const showRef = group.rows.some((r) => r[refKey]);
          return (
            <div key={group.eventName} className="card p-4">
              <h3 className="mb-3 text-base font-bold">{group.eventName}</h3>
              {group.rows.length === 0 ? (
                <p className="text-sm text-muted">Not yet run.</p>
              ) : (
              <div className="overflow-x-auto">
                <table className="mtable">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>Place</th>
                      <th>Name</th>
                      <th>School</th>
                      <th className="text-right">Time/Mark</th>
                      {showRef && <th className="text-right">{refLabel}</th>}
                      <th className="text-right">Points</th>
                      <th>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="font-extrabold tabular-nums">{row.place ?? "—"}</td>
                        <td className="font-extrabold">{row.athleteName}</td>
                        <td className="text-muted">{row.schoolName}</td>
                        <td className="text-right tabular-nums">{row.mark}</td>
                        {showRef && <td className="text-right tabular-nums text-muted">{row[refKey] ?? "—"}</td>}
                        <td className="text-right tabular-nums">{row.points ?? "—"}</td>
                        <td>{row.recordNotation && <span className="tag tag-accent">{row.recordNotation}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
