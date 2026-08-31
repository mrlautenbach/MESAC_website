"use client";

import { useActionState } from "react";
import {
  createTournamentFieldAction,
  updateTournamentFieldAction,
  deleteTournamentFieldAction,
} from "@/lib/actions/tournament-fields";

type Field = { id: string; key: string; label: string };

export function TournamentFieldsManager({ tournamentId, fields }: { tournamentId: string; fields: Field[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Extra columns for this tournament&apos;s schedule and CSV imports, beyond the standard game_id / gender /
        home / home_score / away / away_score / date / time / court / status / streaming_link fields.
      </p>
      {fields.length > 0 && (
        <ul className="space-y-2">
          {fields.map((field) => (
            <FieldRow key={field.id} field={field} />
          ))}
        </ul>
      )}
      <AddFieldForm tournamentId={tournamentId} />
    </div>
  );
}

function FieldRow({ field }: { field: Field }) {
  const [state, formAction, pending] = useActionState(updateTournamentFieldAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTournamentFieldAction, null);

  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm last:border-0">
      <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-muted">{field.key}</code>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="fieldId" value={field.id} />
        <input name="label" defaultValue={field.label} className="field-input w-40 py-1 text-sm" />
        <button type="submit" disabled={pending} className="btn btn-secondary px-2 py-1 text-xs">
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="fieldId" value={field.id} />
        <button type="submit" disabled={deletePending} className="text-xs font-semibold text-danger hover:underline">
          {deletePending ? "Removing…" : "Remove"}
        </button>
      </form>
      {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
      {deleteState && !deleteState.ok && <span className="text-xs text-danger">{deleteState.error}</span>}
    </li>
  );
}

function AddFieldForm({ tournamentId }: { tournamentId: string }) {
  const [state, formAction, pending] = useActionState(createTournamentFieldAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div>
        <label className="field-label" htmlFor={`${tournamentId}-key`}>
          Key (CSV column)
        </label>
        <input id={`${tournamentId}-key`} name="key" placeholder="referee" className="field-input w-36 py-1 text-sm" />
      </div>
      <div>
        <label className="field-label" htmlFor={`${tournamentId}-label`}>
          Label
        </label>
        <input id={`${tournamentId}-label`} name="label" placeholder="Referee" className="field-input w-36 py-1 text-sm" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1 text-xs">
        {pending ? "Adding…" : "Add field"}
      </button>
      {state && !state.ok && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}
