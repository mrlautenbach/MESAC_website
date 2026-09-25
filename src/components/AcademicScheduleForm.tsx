"use client";

import { useActionState } from "react";
import { importAcademicScheduleAction, type ImportAcademicScheduleResult } from "@/lib/actions/academic-games";

// The Academic Games timeline upload: file or pasted text, plus the example
// file to start from (see lib/academicExamples).
export function AcademicScheduleForm({ tournamentId, exampleHref }: { tournamentId: string; exampleHref: string }) {
  const [state, formAction, pending] = useActionState<ImportAcademicScheduleResult | null, FormData>(
    importAcademicScheduleAction,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div>
        <label htmlFor="academicCsvFile" className="field-label">
          Upload .csv file
        </label>
        <input id="academicCsvFile" name="csvFile" type="file" accept=".csv,text/csv" className="field-input" />
      </div>
      <div>
        <label htmlFor="academicCsvText" className="field-label">
          Or paste CSV text
        </label>
        <textarea
          id="academicCsvText"
          name="csvText"
          rows={6}
          className="field-input font-mono text-xs"
          placeholder={`date,start,end,title,team,venue,run_by\n2026-10-30,09:25,10:15,Math Challenge,varsity,Library,AS Dubai`}
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
          Schedule saved: {state.created} added, {state.updated} updated, {state.removed} removed.
          {state.newDivisions.length > 0 && ` Added the ${state.newDivisions.join(" and ")} division${state.newDivisions.length === 1 ? "" : "s"}.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Uploading…" : "Upload schedule"}
        </button>
        <a href={exampleHref} download className="text-sm font-semibold text-primary hover:underline">
          Download example CSV
        </a>
      </div>
    </form>
  );
}
