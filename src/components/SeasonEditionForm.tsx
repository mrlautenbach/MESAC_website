"use client";

import { useActionState } from "react";
import { createTournamentAction, updateTournamentAction } from "@/lib/actions/tournaments";

type ExistingSeason = {
  id: string;
  name: string;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  hostSchoolId: string | null;
};

export function SeasonEditionForm({
  tournamentId: activityId,
  schools,
  existing,
  isFirstEdition,
  defaultHostSchoolId,
}: {
  tournamentId: string;
  schools: { id: string; name: string }[];
  existing?: ExistingSeason;
  isFirstEdition?: boolean;
  defaultHostSchoolId?: string | null;
}) {
  const action = existing ? updateTournamentAction : createTournamentAction;
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <input type="hidden" name="activityId" value={activityId} />
      {existing && <input type="hidden" name="tournamentId" value={existing.id} />}

      {!existing && !isFirstEdition && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-primary">
          Starting a new tournament archives the current one — its schedule, results, and photos stay exactly as
          they are, just no longer shown as the active tournament.
        </p>
      )}

      <div>
        <label htmlFor="name" className="field-label">
          Tournament name
        </label>
        <input id="name" name="name" required placeholder="Fall 2026" defaultValue={existing?.name} className="field-input" />
      </div>
      {!existing && (
        <div>
          <label htmlFor="slug" className="field-label">
            URL slug
          </label>
          <input id="slug" name="slug" required placeholder="jv-volleyball-fall-2026" pattern="[a-z0-9-]+" className="field-input" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="field-label">
            Start date
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={existing?.startDate}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="endDate" className="field-label">
            End date
          </label>
          <input id="endDate" name="endDate" type="date" required defaultValue={existing?.endDate} className="field-input" />
        </div>
      </div>
      <div>
        <label htmlFor="hostSchoolId" className="field-label">
          Host school (optional)
        </label>
        <select
          id="hostSchoolId"
          name="hostSchoolId"
          defaultValue={existing?.hostSchoolId ?? defaultHostSchoolId ?? ""}
          className="field-input"
        >
          <option value="">No host set</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!existing && defaultHostSchoolId && (
          <p className="mt-1 text-xs text-muted">Pre-filled from this activity&apos;s default host — change if needed.</p>
        )}
      </div>

      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Saved!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : existing ? "Save changes" : "Start this tournament"}
      </button>
    </form>
  );
}
