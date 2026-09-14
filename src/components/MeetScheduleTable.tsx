"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { StatusTag } from "@/components/StatusTag";
import { divisionTagClass } from "@/lib/divisionTagClass";
import { GENDER_LABEL, GENDER_TAG_CLASS } from "@/lib/gender";

export type MeetScheduleRow = {
  key: string;
  date: Date;
  sessionTitle: string;
  sessionSlug: string;
  eventName: string | null;
  round: "PRELIM" | "FINAL" | null;
  division: { name: string; slug: string } | null;
  gender: "GIRLS" | "BOYS" | null;
  location: string | null;
  status: string;
};

// Every row for the whole tournament is fetched once, server-side; division
// and gender are filtered here, client-side, so switching between them (or
// back to "All") doesn't need a page navigation the way moving between the
// separate Overall/Varsity/Junior Varsity pages does. `initialDivisionSlug`
// just seeds the dropdown to match whichever page this is (if any) - the
// visitor can still change it freely from there.
export function MeetScheduleTable({
  rows,
  tournamentSlug,
  initialDivisionSlug,
}: {
  rows: MeetScheduleRow[];
  tournamentSlug: string;
  initialDivisionSlug?: string;
}) {
  const divisions = useMemo(() => {
    const bySlug = new Map<string, { name: string; slug: string }>();
    for (const r of rows) if (r.division) bySlug.set(r.division.slug, r.division);
    return Array.from(bySlug.values());
  }, [rows]);
  const genders = useMemo(
    () => Array.from(new Set(rows.map((r) => r.gender).filter((g): g is "GIRLS" | "BOYS" => g !== null))),
    [rows]
  );

  const [divisionSlug, setDivisionSlug] = useState(initialDivisionSlug ?? "");
  const [gender, setGender] = useState<"" | "GIRLS" | "BOYS">("");

  if (rows.length === 0) return <p className="text-muted">No events scheduled yet.</p>;

  const visibleRows = rows
    .filter((r) => !divisionSlug || r.division?.slug === divisionSlug)
    .filter((r) => !gender || r.gender === gender);

  // Hide Division once it's pinned to one value via the filter - showing a
  // column that reads the same on every row adds nothing.
  const showDivisionCol = !divisionSlug && visibleRows.some((r) => r.division);
  const showGenderCol = !gender && visibleRows.some((r) => r.gender);
  const showRoundCol = visibleRows.some((r) => r.round);

  const dayGroups: { key: string; rows: MeetScheduleRow[] }[] = [];
  const indexByDay = new Map<string, number>();
  for (const row of visibleRows) {
    const key = format(row.date, "yyyy-MM-dd");
    if (!indexByDay.has(key)) {
      indexByDay.set(key, dayGroups.length);
      dayGroups.push({ key, rows: [] });
    }
    dayGroups[indexByDay.get(key)!].rows.push(row);
  }

  return (
    <div className="space-y-6">
      {(divisions.length > 1 || genders.length > 1) && (
        <div className="flex flex-wrap items-center gap-3">
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
      )}

      {visibleRows.length === 0 ? (
        <p className="text-muted">No events match this filter.</p>
      ) : (
        dayGroups.map((group) => (
          <div key={group.key}>
            <h5 className="mb-2 border-b-2 border-divider pb-1.5 text-sm font-bold text-primary-dark">
              {format(group.rows[0].date, "EEEE, MMM d, yyyy")}
            </h5>
            <div className="overflow-x-auto">
              <table className="mtable">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Session</th>
                    <th>Event</th>
                    {showRoundCol && <th>Round</th>}
                    {showDivisionCol && <th>Division</th>}
                    {showGenderCol && <th>Gender</th>}
                    <th>Court</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="whitespace-nowrap tabular-nums">{format(row.date, "h:mm a")}</td>
                      <td>
                        <Link
                          href={`/seasons/${tournamentSlug}/events/${row.sessionSlug}`}
                          className="font-semibold hover:text-primary"
                        >
                          {row.sessionTitle}
                        </Link>
                      </td>
                      <td>{row.eventName ?? "—"}</td>
                      {showRoundCol && <td>{row.round ? (row.round === "PRELIM" ? "Preliminary" : "Final") : "—"}</td>}
                      {showDivisionCol && (
                        <td>
                          {row.division ? (
                            <span className={`tag ${divisionTagClass(row.division.name)}`}>{row.division.name}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      {showGenderCol && (
                        <td>
                          {row.gender ? (
                            <span className={`tag ${GENDER_TAG_CLASS[row.gender]}`}>{GENDER_LABEL[row.gender]}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td>{row.location ?? "—"}</td>
                      <td>
                        <StatusTag status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
