"use client";

import { useCsvText } from "@/components/useCsvText";
import { useActionState, useId } from "react";
import {
  importAcademicScheduleAction,
  importBowlScheduleAction,
  importChallengeResultsAction,
  saveBowlScoresAction,
  type AcademicImportResult,
} from "@/lib/actions/academic-games";

const IMPORTS = {
  schedule: { action: importAcademicScheduleAction, submit: "Upload schedule" },
  bowl: { action: importBowlScheduleAction, submit: "Upload bowl schedule" },
  challenges: { action: importChallengeResultsAction, submit: "Upload challenge results" },
} as const;

function Outcome({ state }: { state: AcademicImportResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p role="status" className="bg-green-50 px-3 py-2 text-sm text-success">
        {state.summary}
      </p>
    );
  }
  return (
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
  );
}

// One Academic Games CSV upload: file or pasted text, plus the example file
// to start from (see lib/academicExamples).
export function AcademicCsvForm({
  kind,
  tournamentId,
  placeholder,
  exampleHref,
}: {
  kind: keyof typeof IMPORTS;
  tournamentId: string;
  placeholder: string;
  exampleHref: string;
}) {
  const { action, submit } = IMPORTS[kind];
  const [state, formAction, pending] = useActionState<AcademicImportResult | null, FormData>(action, null);
  const id = useId();
  const csvText = useCsvText(state);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div>
        <label htmlFor={`${id}-file`} className="field-label">
          Upload .csv file
        </label>
        <input id={`${id}-file`} name="csvFile" type="file" accept=".csv,text/csv" className="field-input" />
      </div>
      <div>
        <label htmlFor={`${id}-text`} className="field-label">
          Or paste CSV text
        </label>
        <textarea {...csvText} id={`${id}-text`} name="csvText" rows={6} className="field-input font-mono text-xs" placeholder={placeholder} />
      </div>
      <Outcome state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Uploading…" : submit}
        </button>
        <a href={exampleHref} download className="text-sm font-semibold text-primary hover:underline">
          Download example CSV
        </a>
      </div>
    </form>
  );
}

// One bowl round's scores: two boxes per game, saved together.
export function BowlScoresForm({
  games,
}: {
  games: { id: string; room: string | null; teamA: string; teamB: string; scoreA: number | null; scoreB: number | null; ready: boolean }[];
}) {
  const [state, formAction, pending] = useActionState<AcademicImportResult | null, FormData>(saveBowlScoresAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <ul className="divide-y divide-border">
        {games.map((g) => (
          <li key={g.id} className="grid grid-cols-[4rem_minmax(0,1fr)_3.5rem_3.5rem_minmax(0,1fr)] items-center gap-2 py-1.5 text-sm">
            <input type="hidden" name="gameId" value={g.id} />
            <span className="truncate text-xs text-muted">{g.room ?? ""}</span>
            <label htmlFor={`a-${g.id}`} className="truncate text-right font-semibold">
              {g.teamA}
            </label>
            <input
              id={`a-${g.id}`}
              name={`a-${g.id}`}
              key={`a-${g.scoreA ?? ""}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              defaultValue={g.scoreA ?? ""}
              disabled={!g.ready}
              className="field-input px-1 py-1 text-center tabular-nums"
            />
            <input
              id={`b-${g.id}`}
              name={`b-${g.id}`}
              key={`b-${g.scoreB ?? ""}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              defaultValue={g.scoreB ?? ""}
              disabled={!g.ready}
              aria-label={`${g.teamB} score`}
              className="field-input px-1 py-1 text-center tabular-nums"
            />
            <span className="truncate font-semibold">{g.teamB}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1.5 text-sm">
          {pending ? "Saving…" : "Save scores"}
        </button>
        {state?.ok && <span className="text-sm text-success">{state.summary}</span>}
        {state && !state.ok && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
