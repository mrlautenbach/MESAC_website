"use client";

import { useActionState, useState } from "react";
import { deleteTournamentAction } from "@/lib/actions/tournaments";

export function DeleteTournamentForm({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  const [state, formAction, pending] = useActionState(deleteTournamentAction, null);
  const [confirmName, setConfirmName] = useState("");

  return (
    <div className="space-y-2 border border-danger/40 bg-danger/5 p-3">
      <p className="text-xs text-danger">
        Permanently deletes this tournament and everything under it - its schedule, results, divisions, and team
        photos. The activity itself and its other tournaments are untouched. This can&apos;t be undone.
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <div>
          <label className="field-label" htmlFor={`${tournamentId}-confirm-name`}>
            Type &quot;{tournamentName}&quot; to confirm
          </label>
          <input
            id={`${tournamentId}-confirm-name`}
            name="confirmName"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
            className="field-input w-56 py-1 text-sm"
          />
        </div>
        <button type="submit" disabled={pending || confirmName !== tournamentName} className="btn btn-danger px-3 py-1 text-xs">
          {pending ? "Deleting…" : "Delete tournament permanently"}
        </button>
      </form>
      {state && !state.ok && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
