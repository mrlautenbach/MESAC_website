"use client";

import { useMemo, useState } from "react";
import { divisionTagClass } from "@/lib/divisionTagClass";
import { GENDER_LABEL, GENDER_TAG_CLASS } from "@/lib/gender";

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
  // Null when no program was uploaded for this session - nothing to number
  // the event with, so it's grouped by first-appearance order instead.
  eventNumber: number | null;
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

type RoundFilter = "prelim" | "final" | "all";

export function MeetResultsView({ groups }: { groups: MeetResultGroup[] }) {
  const hasPrelim = groups.some((g) => g.prelim.length > 0 || g.plannedRounds.prelim);
  const hasFinal = groups.some((g) => g.final.length > 0 || g.plannedRounds.final);
  const [round, setRound] = useState<RoundFilter>(hasFinal ? "final" : "prelim");

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

  const showPrelim = round === "prelim" || round === "all";
  const showFinal = round === "final" || round === "all";

  const visibleGroups = groups
    .filter((g) => !divisionSlug || g.division?.slug === divisionSlug)
    .filter((g) => !gender || g.gender === gender)
    .map((g) => ({
      key: g.key,
      eventNumber: g.eventNumber,
      eventName: g.eventName,
      division: g.division,
      gender: g.gender,
      prelim: showPrelim && (g.prelim.length > 0 || g.plannedRounds.prelim) ? g.prelim : null,
      final: showFinal && (g.final.length > 0 || g.plannedRounds.final) ? g.final : null,
    }))
    .filter((g) => g.prelim !== null || g.final !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {hasPrelim && hasFinal && (
          <div className="inline-flex border border-border">
            <button
              type="button"
              onClick={() => setRound("prelim")}
              aria-pressed={round === "prelim"}
              className={`px-3 py-1.5 text-sm font-semibold ${round === "prelim" ? "bg-primary text-background" : "text-muted"}`}
            >
              Preliminary
            </button>
            <button
              type="button"
              onClick={() => setRound("final")}
              aria-pressed={round === "final"}
              className={`px-3 py-1.5 text-sm font-semibold ${round === "final" ? "bg-primary text-background" : "text-muted"}`}
            >
              Final
            </button>
            <button
              type="button"
              onClick={() => setRound("all")}
              aria-pressed={round === "all"}
              className={`px-3 py-1.5 text-sm font-semibold ${round === "all" ? "bg-primary text-background" : "text-muted"}`}
            >
              All
            </button>
          </div>
        )}

        {genders.length > 1 && (
          <div className="inline-flex border border-border">
            <button
              type="button"
              onClick={() => setGender("")}
              aria-pressed={gender === ""}
              className={`px-3 py-1.5 text-sm font-semibold ${gender === "" ? "bg-primary text-background" : "text-muted"}`}
            >
              All
            </button>
            {(["GIRLS", "BOYS"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                aria-pressed={gender === g}
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
            aria-label="Division"
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
          No {round === "all" ? "" : round === "prelim" ? "preliminary " : "final "}results have been posted yet.
        </p>
      ) : (
        visibleGroups.map((group) => (
          <div key={group.key} className="card p-4">
            <h3 className="mb-3 flex flex-wrap items-center gap-2 text-base">
              {group.eventNumber != null && <span className="text-muted">Event {group.eventNumber}</span>}
              {group.eventName}
              {group.gender && <span className={`tag ${GENDER_TAG_CLASS[group.gender]}`}>{GENDER_LABEL[group.gender]}</span>}
              {group.division && (
                <span className={`tag ${divisionTagClass(group.division.name)}`}>{group.division.name}</span>
              )}
            </h3>
            <div className="space-y-4">
              {group.prelim !== null && (
                <RoundTable label={round === "all" ? "Preliminary" : null} rows={group.prelim} refKey="seedMark" refLabel="Seed" />
              )}
              {group.final !== null && (
                <RoundTable label={round === "all" ? "Final" : null} rows={group.final} refKey="prelimMark" refLabel="Prelim" />
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function RoundTable({
  label,
  rows,
  refKey,
  refLabel,
}: {
  label: string | null;
  rows: MeetResultRow[];
  refKey: "seedMark" | "prelimMark";
  refLabel: string;
}) {
  const showRef = rows.some((r) => r[refKey]);
  return (
    <div>
      {label && <h4 className="mb-1.5 text-xs uppercase tracking-wide text-muted">{label}</h4>}
      {rows.length === 0 ? (
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
              {rows.map((row) => (
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
}
