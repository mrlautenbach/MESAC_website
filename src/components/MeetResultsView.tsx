"use client";

import { useMemo, useState } from "react";
import { divisionTagClass } from "@/lib/divisionTagClass";

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
  key: string;
  eventName: string;
  // Skill level (e.g. "Varsity"/"Junior Varsity") and Girls/Boys gender for
  // this named event - independent of each other, both null when no
  // program has been uploaded for this session, or the entry didn't set
  // one.
  division: { name: string; slug: string } | null;
  gender: "GIRLS" | "BOYS" | null;
  plannedRounds: { prelim: boolean; final: boolean };
  prelim: MeetResultRow[];
  final: MeetResultRow[];
};

const GENDER_LABEL: Record<"GIRLS" | "BOYS", string> = { GIRLS: "Girls", BOYS: "Boys" };
const GENDER_TAG_CLASS: Record<"GIRLS" | "BOYS", string> = { GIRLS: "tag-girls", BOYS: "tag-boys" };

export function MeetResultsView({ groups }: { groups: MeetResultGroup[] }) {
  const hasPrelim = groups.some((g) => g.prelim.length > 0 || g.plannedRounds.prelim);
  const hasFinal = groups.some((g) => g.final.length > 0 || g.plannedRounds.final);
  const [round, setRound] = useState<"prelim" | "final">(hasFinal ? "final" : "prelim");

  // Division and gender are independent axes on the same groups - a filter
  // and a toggle, each shown only when the groups actually vary along it.
  const divisions = useMemo(() => {
    const bySlug = new Map<string, { name: string; slug: string }>();
    for (const g of groups) if (g.division) bySlug.set(g.division.slug, g.division);
    return Array.from(bySlug.values());
  }, [groups]);
  const genders = useMemo(
    () => Array.from(new Set(groups.map((g) => g.gender).filter((g): g is "GIRLS" | "BOYS" => g !== null))),
    [groups]
  );
  const [divisionSlug, setDivisionSlug] = useState<string>("");
  const [gender, setGender] = useState<"" | "GIRLS" | "BOYS">("");

  const visibleGroups = groups
    .filter((g) => !divisionSlug || g.division?.slug === divisionSlug)
    .filter((g) => !gender || g.gender === gender)
    .map((g) => ({
      key: g.key,
      eventName: g.eventName,
      division: g.division,
      gender: g.gender,
      rows: round === "prelim" ? g.prelim : g.final,
      planned: round === "prelim" ? g.plannedRounds.prelim : g.plannedRounds.final,
    }))
    .filter((g) => g.rows.length > 0 || g.planned);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {hasPrelim && hasFinal && (
          <div className="inline-flex border border-border">
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

        {genders.length > 1 && (
          <div className="inline-flex border border-border">
            <button
              type="button"
              onClick={() => setGender("")}
              className={`px-3 py-1.5 text-sm font-semibold ${gender === "" ? "bg-primary text-background" : "text-muted"}`}
            >
              All
            </button>
            {(["GIRLS", "BOYS"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`px-3 py-1.5 text-sm font-semibold ${gender === g ? "bg-primary text-background" : "text-muted"}`}
              >
                {GENDER_LABEL[g]}
              </button>
            ))}
          </div>
        )}

        {divisions.length > 1 && (
          <select
            value={divisionSlug}
            onChange={(e) => setDivisionSlug(e.target.value)}
            className="field-input w-auto py-1.5 text-sm"
          >
            <option value="">All divisions</option>
            {divisions.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

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
            <div key={group.key} className="card p-4">
              <h3 className="mb-3 flex flex-wrap items-center gap-2 text-base font-bold">
                {group.eventName}
                {group.gender && <span className={`tag ${GENDER_TAG_CLASS[group.gender]}`}>{GENDER_LABEL[group.gender]}</span>}
                {group.division && (
                  <span className={`tag ${divisionTagClass(group.division.name)}`}>{group.division.name}</span>
                )}
              </h3>
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
