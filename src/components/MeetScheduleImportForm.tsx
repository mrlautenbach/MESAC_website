"use client";

import { useActionState, useMemo } from "react";
import { importMeetScheduleAction, type ImportMeetScheduleResult } from "@/lib/actions/meet-schedule";

type Props = {
  tournamentId: string;
  divisions: { id: string; name: string }[];
};

function buildTemplate(divisions: Props["divisions"]) {
  const hasDivisions = divisions.length > 0;
  const divisionCol = hasDivisions ? ["division"] : [];
  const divisionCell = hasDivisions ? [divisions[0].name] : [];
  const header = [
    "date",
    "session",
    "event_number",
    "round",
    "event_name",
    "gender",
    ...divisionCol,
    "location",
    "status",
    "live_stream",
    "time",
  ];
  // Event 1 shows a prelim/final pair across two different sessions; event 2
  // shows a single (final-only) event - both are valid shapes.
  const rows = [
    ["2026-09-12", "Day 1 Prelims", "1", "prelim", "100m Freestyle", "Girls", ...divisionCell, "Aquatics Center", "SCHEDULED", "", "09:00"],
    ["2026-09-12", "Day 1 Finals", "1", "final", "100m Freestyle", "Girls", ...divisionCell, "Aquatics Center", "SCHEDULED", "https://example.com/live", "18:00"],
    ["2026-09-12", "Day 1 Finals", "2", "", "200m Individual Medley", "Girls", ...divisionCell, "Aquatics Center", "SCHEDULED", "", "18:20"],
  ];
  return `${header.join(",")}\n${rows.map((r) => r.join(",")).join("\n")}\n`;
}

export function MeetScheduleImportForm({ tournamentId, divisions }: Props) {
  const [state, formAction, pending] = useActionState<ImportMeetScheduleResult | null, FormData>(
    importMeetScheduleAction,
    null
  );

  const templateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(buildTemplate(divisions))}`,
    [divisions]
  );

  if (state?.ok) {
    return (
      <div className="bg-green-50 px-4 py-3 text-sm text-success">
        Imported {state.rounds} round{state.rounds === 1 ? "" : "s"} across {state.sessions} session
        {state.sessions === 1 ? "" : "s"} ({state.newSessions} new). Refresh the schedule to see them, or{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          import another file
        </button>
        .
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <input type="hidden" name="tournamentId" value={tournamentId} />

      <div className="card space-y-2 p-4 text-sm">
        <p className="font-semibold">CSV columns</p>
        <p className="text-muted">
          Required: <code>date</code> (YYYY-MM-DD), <code>session</code> (e.g. &quot;Day 1 Prelims&quot; - created
          automatically the first time it&apos;s seen in the file and reused for every later row with the same
          name), <code>event_number</code>, <code>event_name</code>. Optional: <code>round</code> (&quot;prelim&quot;
          or &quot;final&quot; - only needed when an event_number appears twice, to say which row is which; a
          lone event_number defaults to &quot;final&quot;), <code>gender</code> (&quot;girls&quot; or
          &quot;boys&quot;),{" "}
          {divisions.length > 0 && (
            <>
              <code>division</code> ({divisions.map((d) => d.name).join(" or ")} - required for this tournament;
              &quot;JV&quot; and &quot;Junior Varsity&quot; are treated as the same division either way),{" "}
            </>
          )}
          <code>location</code>, <code>status</code> (SCHEDULED/COMPLETED/CANCELLED, defaults to SCHEDULED),{" "}
          <code>live_stream</code> (link to watch live), and <code>time</code> (HH:MM, defaults to 09:00).
        </p>
        <p className="text-muted">
          Most columns just become the text shown on the site as-is - only <code>gender</code> and{" "}
          <code>division</code> are checked against known values. An event_number listed twice needs one
          &quot;prelim&quot; row and one &quot;final&quot; row between them (they can be in two different sessions,
          e.g. a morning prelims block and an evening finals block); listing it a third time, or twice with the
          same round, is an error.
        </p>
        <p className="text-muted">
          This sets up the schedule and program together - upload actual placings separately, per session, from
          that session&apos;s own page.
        </p>
        <p className="text-muted">
          Re-uploading replaces any event_number this file mentions (wherever it was before) - event_numbers left
          out of the file keep whatever they already have.
        </p>
        <a href={templateHref} download="meet-schedule-template.csv" className="btn btn-secondary">
          Download CSV template
        </a>
      </div>

      <div>
        <label htmlFor="csvFile" className="field-label">
          Upload .csv file
        </label>
        <input id="csvFile" name="csvFile" type="file" accept=".csv,text/csv" className="field-input" />
      </div>

      <div>
        <label htmlFor="csvText" className="field-label">
          Or paste CSV text
        </label>
        <textarea
          id="csvText"
          name="csvText"
          rows={8}
          className="field-input font-mono text-xs"
          placeholder={`date,session,event_number,event_name\n2026-09-12,Day 1 Finals,1,100m Freestyle`}
        />
      </div>

      {state && !state.ok && (
        <div role="alert" className="space-y-2 bg-red-50 px-4 py-3 text-sm text-danger">
          <p className="font-semibold">{state.error}</p>
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="list-inside list-disc space-y-1">
              {state.rowErrors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Importing…" : "Import schedule"}
      </button>
    </form>
  );
}
