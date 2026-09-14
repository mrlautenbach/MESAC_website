"use client";

import { useActionState } from "react";
import { importMeetProgramAction, type ImportMeetProgramResult } from "@/lib/actions/meet-program";

export function MeetProgramImportForm({ tournamentId }: { tournamentId: string }) {
  const [state, formAction, pending] = useActionState<ImportMeetProgramResult | null, FormData>(
    importMeetProgramAction,
    null
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4 text-sm">
        <p className="font-semibold">CSV columns</p>
        <p className="text-muted">
          Required: <code>session</code> (must match a session&apos;s title exactly - create the session from the
          schedule first), <code>event_number</code> (this race&apos;s identity - a prelim and a final row for the
          same race share the same number), <code>event_name</code> (e.g. &quot;100m Freestyle&quot;). Optional:{" "}
          <code>round</code> (&quot;prelim&quot; or &quot;final&quot;, defaults to final), <code>division</code> (must
          match one of this tournament&apos;s divisions exactly, e.g. &quot;Varsity&quot; or &quot;Junior
          Varsity&quot;), <code>gender</code> (&quot;girls&quot; or &quot;boys&quot;).
        </p>
        <p className="text-muted">
          Division and gender are independent of each other and of the session&apos;s own division, if it has one -
          set either, both, or neither per row. They drive the Division/Gender filters on the session&apos;s results
          and decide which division pages a result shows up on.
        </p>
        <p className="text-muted">
          This just sets up the program (event order) so upcoming events show up before they&apos;re run - upload
          actual placings separately, per session, from that session&apos;s own page.
        </p>
        <p className="text-muted">
          Re-uploading replaces the program for any session mentioned in the file - sessions left out of the file
          keep their existing program.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="tournamentId" value={tournamentId} />

        <div>
          <label htmlFor="programCsvFile" className="field-label">
            Upload .csv file
          </label>
          <input id="programCsvFile" name="csvFile" type="file" accept=".csv,text/csv" className="field-input" />
        </div>

        <div>
          <label htmlFor="programCsvText" className="field-label">
            Or paste CSV text
          </label>
          <textarea
            id="programCsvText"
            name="csvText"
            rows={6}
            className="field-input font-mono text-xs"
            placeholder={`session,event_number,event_name,round,division,gender\nDay 1 Prelims,1,200m Medley Relay,prelim,Varsity,girls\nDay 1 Finals,1,200m Medley Relay,final,Varsity,girls`}
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
        {state?.ok && (
          <p role="status" className="bg-green-50 px-3 py-2 text-sm text-success">
            Imported {state.imported} program entr{state.imported === 1 ? "y" : "ies"} across {state.sessions}{" "}
            session{state.sessions === 1 ? "" : "s"}!
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Importing…" : "Import program"}
        </button>
      </form>
    </div>
  );
}
