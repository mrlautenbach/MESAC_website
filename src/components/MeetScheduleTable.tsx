"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { StatusTag } from "@/components/StatusTag";
import { divisionTagClass } from "@/lib/divisionTagClass";
import { LiveIcon } from "@/components/icons/LiveIcon";

export type MeetScheduleRow = {
  key: string;
  date: Date;
  sessionId: string;
  sessionTitle: string;
  sessionSlug: string;
  eventNumber: number | null;
  eventName: string | null;
  round: "PRELIM" | "FINAL" | null;
  // Division name already says Girls/Boys where that applies, so gender
  // isn't shown as its own column here (see MeetResultsView for the results
  // page, which still separates by gender since a division can hold both).
  division: { name: string; slug: string } | null;
  status: string;
  liveStreamUrl: string | null;
};

// Every row for the whole tournament is fetched once, server-side; division
// is filtered here, client-side, so switching between them (or back to
// "All") doesn't need a page navigation the way moving between the separate
// Overall/Varsity/Junior Varsity pages does. `initialDivisionSlug` just
// seeds the dropdown to match whichever page this is (if any) - the visitor
// can still change it freely from there.
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

  const [divisionSlug, setDivisionSlug] = useState(initialDivisionSlug ?? "");

  if (rows.length === 0) return <p className="text-muted">No events scheduled yet.</p>;

  const visibleRows = rows.filter((r) => !divisionSlug || r.division?.slug === divisionSlug);

  // Hide Division once it's pinned to one value via the filter - showing a
  // column that reads the same on every row adds nothing.
  const showDivisionCol = !divisionSlug && visibleRows.some((r) => r.division);
  const showRoundCol = visibleRows.some((r) => r.round);

  // One group per session (e.g. "Day 1 Prelims", "Day 1 Finals") rather than
  // per calendar day, so a morning session and an evening session on the
  // same day show as two separate blocks instead of one merged table.
  // Groups are ordered by the session's own time; rows within a group by
  // event_number, since that's the meet's actual running order.
  const sessionGroups: { sessionId: string; date: Date; rows: MeetScheduleRow[] }[] = [];
  const indexBySession = new Map<string, number>();
  for (const row of visibleRows) {
    if (!indexBySession.has(row.sessionId)) {
      indexBySession.set(row.sessionId, sessionGroups.length);
      sessionGroups.push({ sessionId: row.sessionId, date: row.date, rows: [] });
    }
    const group = sessionGroups[indexBySession.get(row.sessionId)!];
    group.rows.push(row);
    if (row.date < group.date) group.date = row.date;
  }
  sessionGroups.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const group of sessionGroups) {
    group.rows.sort((a, b) => (a.eventNumber ?? 0) - (b.eventNumber ?? 0));
  }

  return (
    <div className="space-y-6">
      {divisions.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
      )}

      {visibleRows.length === 0 ? (
        <p className="text-muted">No events match this filter.</p>
      ) : (
        sessionGroups.map((group) => (
          <div key={group.sessionId}>
            <h5 className="mb-2 flex flex-wrap items-baseline gap-x-2 border-b-2 border-divider pb-1.5 text-sm font-bold text-primary-dark">
              <Link
                href={`/seasons/${tournamentSlug}/events/${group.rows[0].sessionSlug}`}
                className="hover:underline"
              >
                {group.rows[0].sessionTitle}
              </Link>
              <span className="font-normal text-muted">{format(group.date, "EEEE, MMM d, yyyy · h:mm a")}</span>
            </h5>
            <div className="overflow-x-auto">
              <table className="mtable">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Event</th>
                    {showRoundCol && <th>Round</th>}
                    {showDivisionCol && <th>Division</th>}
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="tabular-nums text-muted">{row.eventNumber ?? "—"}</td>
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
                      <td className="whitespace-nowrap tabular-nums">{format(row.date, "h:mm a")}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusTag status={row.status} />
                          {row.liveStreamUrl && row.status === "SCHEDULED" && (
                            <a
                              href={row.liveStreamUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tag tag-accent shrink-0 gap-1"
                            >
                              <LiveIcon />
                              Watch live
                            </a>
                          )}
                        </div>
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
