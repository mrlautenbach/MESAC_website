"use client";

import { useActionState, useId } from "react";
import {
  importGolfDrawAction,
  importGolfRosterAction,
  importGolfScoresAction,
  saveGolfGroupScoresAction,
  type GolfImportResult,
} from "@/lib/actions/golf";

const IMPORTS = {
  roster: { action: importGolfRosterAction, submit: "Upload roster" },
  draw: { action: importGolfDrawAction, submit: "Upload draw" },
  scores: { action: importGolfScoresAction, submit: "Upload scores" },
} as const;

function Outcome({ state }: { state: GolfImportResult | null }) {
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

// One CSV upload (roster, Day 1 draw or scores): file or pasted text, plus
// a template to start from.
export function GolfCsvForm({
  kind,
  tournamentId,
  template,
  templateName,
}: {
  kind: keyof typeof IMPORTS;
  tournamentId: string;
  template: string;
  templateName: string;
}) {
  const { action, submit } = IMPORTS[kind];
  const [state, formAction, pending] = useActionState<GolfImportResult | null, FormData>(action, null);
  const id = useId();

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
        <textarea id={`${id}-text`} name="csvText" rows={5} className="field-input font-mono text-xs" placeholder={template} />
      </div>
      <Outcome state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Uploading…" : submit}
        </button>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
          download={templateName}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Download template
        </a>
      </div>
    </form>
  );
}

// One tee-time group's scores: a points box per player, saved together.
export function GolfGroupScoresForm({
  groupId,
  players,
}: {
  groupId: string;
  players: { id: string; name: string; schoolLabel: string; points: number | null }[];
}) {
  const [state, formAction, pending] = useActionState<GolfImportResult | null, FormData>(saveGolfGroupScoresAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      <ul className="divide-y divide-border">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-1.5">
            <label htmlFor={`points-${p.id}`} className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{p.name}</span> <span className="text-muted">{p.schoolLabel}</span>
            </label>
            <input
              id={`points-${p.id}`}
              name={`points-${p.id}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              defaultValue={p.points ?? ""}
              className="field-input w-20 text-right tabular-nums"
              aria-label={`${p.name} points`}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1.5 text-sm">
          {pending ? "Saving…" : "Save scores"}
        </button>
        {state?.ok && <span className="text-sm text-success">Saved.</span>}
        {state && !state.ok && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
