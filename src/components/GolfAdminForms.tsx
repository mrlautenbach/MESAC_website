"use client";

import { useCsvText } from "@/components/useCsvText";
import { useActionState, useId } from "react";
import {
  importGolfDrawAction,
  importGolfRosterAction,
  importGolfScoresAction,
  importGolfTeamDrawAction,
  importGolfTeamResultsAction,
  saveGolfGroupScoresAction,
  saveGolfMatchResultsAction,
  type GolfImportResult,
} from "@/lib/actions/golf";
import { CsvImportOutcome } from "@/components/CsvImportOutcome";

const IMPORTS = {
  roster: { action: importGolfRosterAction, submit: "Upload roster" },
  draw: { action: importGolfDrawAction, submit: "Upload draw" },
  scores: { action: importGolfScoresAction, submit: "Upload scores" },
  teamDraw: { action: importGolfTeamDrawAction, submit: "Upload team draw" },
  teamResults: { action: importGolfTeamResultsAction, submit: "Upload team results" },
} as const;

// One CSV upload: file or pasted text, plus an example file to start from
// (see lib/golfExamples - complete, and filled in from what's already set up).
export function GolfCsvForm({
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
  const [state, formAction, pending] = useActionState<GolfImportResult | null, FormData>(action, null);
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
        <textarea {...csvText} id={`${id}-text`} name="csvText" rows={5} className="field-input font-mono text-xs" placeholder={placeholder} />
      </div>
      <CsvImportOutcome state={state} />
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

// One school match's results: for each flight, who won (or halved) and by
// how much, saved together.
export function GolfMatchResultsForm({
  matchId,
  homeLabel,
  awayLabel,
  pairs,
}: {
  matchId: string;
  homeLabel: string;
  awayLabel: string;
  pairs: {
    id: string;
    flight: number;
    startHole: number | null;
    homePair: string;
    awayPair: string;
    winner: "HOME" | "AWAY" | "HALVED" | null;
    margin: string | null;
  }[];
}) {
  const [state, formAction, pending] = useActionState<GolfImportResult | null, FormData>(saveGolfMatchResultsAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="matchId" value={matchId} />
      <ul className="divide-y divide-border">
        {pairs.map((p) => (
          <li key={p.id} className="space-y-1.5 py-2">
            <div className="text-xs text-muted">
              Flight {p.flight}
              {p.startHole ? ` · Hole ${p.startHole}` : ""}
            </div>
            <div className="text-sm">
              <span className="font-semibold">{p.homePair}</span> <span className="text-muted">vs</span>{" "}
              <span className="font-semibold">{p.awayPair}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <select key={p.winner ?? ""} name={`winner-${p.id}`} defaultValue={p.winner ?? ""} className="field-input w-auto py-1 text-sm" aria-label={`Flight ${p.flight} winner`}>
                <option value="">Not played yet</option>
                <option value="HOME">{homeLabel} won</option>
                <option value="AWAY">{awayLabel} won</option>
                <option value="HALVED">Halved</option>
              </select>
              <input
                name={`margin-${p.id}`}
                defaultValue={p.margin && p.margin !== "AS" ? p.margin : ""}
                placeholder="e.g. 3 up, 2&1"
                maxLength={20}
                className="field-input w-32 py-1 text-sm"
                aria-label={`Flight ${p.flight} margin`}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1.5 text-sm">
          {pending ? "Saving…" : "Save results"}
        </button>
        {state?.ok && <span className="text-sm text-success">Saved.</span>}
        {state && !state.ok && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
