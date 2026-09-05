"use client";

import { useActionState } from "react";
import { importMeetResultsAction, clearMeetResultsAction, type ImportMeetResultsResult } from "@/lib/actions/meet-results";

export function MeetResultsImportForm({ eventId, resultCount }: { eventId: string; resultCount: number }) {
  const [state, formAction, pending] = useActionState<ImportMeetResultsResult | null, FormData>(
    importMeetResultsAction,
    null
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4 text-sm">
        <p className="font-semibold">CSV columns</p>
        <p className="text-muted">
          Required: <code>event_name</code> (e.g. &quot;100m Freestyle&quot;), <code>name</code> (athlete),{" "}
          <code>school</code> (short code or exact name), <code>mark</code> (time or distance, e.g. &quot;58.21&quot;
          or &quot;6.50m&quot;). Optional: <code>round</code> (&quot;prelim&quot; or &quot;final&quot;, defaults to
          final), <code>place</code>, <code>points</code>, and <code>record</code> (any notation you use, e.g.
          &quot;MR&quot; or &quot;SR&quot;).
        </p>
        <p className="text-muted">
          Re-uploading replaces every result already imported for this event - there&apos;s no per-row editor, so fix
          a mistake by correcting the file and uploading it again.
        </p>
      </div>

      {resultCount > 0 && (
        <p className="text-sm text-muted">
          {resultCount} result{resultCount === 1 ? "" : "s"} currently imported for this event.{" "}
          <button
            type="button"
            className="text-danger underline"
            onClick={async () => {
              if (confirm(`Remove all ${resultCount} imported meet results for this event?`)) {
                await clearMeetResultsAction(eventId);
              }
            }}
          >
            Clear all
          </button>
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />

        <div>
          <label htmlFor="meetCsvFile" className="field-label">
            Upload .csv file
          </label>
          <input id="meetCsvFile" name="csvFile" type="file" accept=".csv,text/csv" className="field-input" />
        </div>

        <div>
          <label htmlFor="meetCsvText" className="field-label">
            Or paste CSV text
          </label>
          <textarea
            id="meetCsvText"
            name="csvText"
            rows={6}
            className="field-input font-mono text-xs"
            placeholder={`event_name,round,place,name,school,mark,points,record\n100m Freestyle,final,1,Jane Doe,ASD,58.21,9,MR`}
          />
        </div>

        {state && !state.ok && (
          <div role="alert" className="space-y-2 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
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
        {state?.ok && (
          <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
            Imported {state.imported} result{state.imported === 1 ? "" : "s"}!
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Importing…" : "Import results"}
        </button>
      </form>
    </div>
  );
}
