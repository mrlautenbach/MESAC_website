"use client";

import { useActionState } from "react";
import { addDivisionAction } from "@/lib/actions/activities";

const SUGGESTIONS = ["Girls", "Boys", "Girls JV", "Boys JV", "Girls Varsity", "Boys Varsity", "Overall"];

export function DivisionsManager({ activityId, divisions }: { activityId: string; divisions: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(addDivisionAction, null);
  const existingNames = new Set(divisions.map((d) => d.name.trim().toLowerCase()));
  const remaining = SUGGESTIONS.filter((s) => !existingNames.has(s.toLowerCase()));

  return (
    <div className="space-y-3">
      {divisions.length > 0 ? (
        <p className="text-xs text-muted">Current divisions: {divisions.map((d) => d.name).join(", ")}</p>
      ) : (
        <p className="text-xs text-muted">No divisions yet - this activity is a single, ungendered bracket.</p>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="activityId" value={activityId} />
        <div>
          <label className="field-label" htmlFor={`${activityId}-division-name`}>
            Add a division
          </label>
          <input
            id={`${activityId}-division-name`}
            name="name"
            list={`${activityId}-division-suggestions`}
            placeholder="Girls JV"
            className="field-input w-44 py-1 text-sm"
          />
          <datalist id={`${activityId}-division-suggestions`}>
            {remaining.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1 text-xs">
          {pending ? "Adding…" : "Add division"}
        </button>
      </form>
      {state && !state.ok && <p className="text-xs text-danger">{state.error}</p>}
      {state?.ok && <p className="text-xs text-success">Added!</p>}
    </div>
  );
}
