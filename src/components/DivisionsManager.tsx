"use client";

import { useActionState } from "react";
import { syncDivisionsAction } from "@/lib/actions/activities";

const PRESETS = ["Girls", "Boys", "Girls JV", "Boys JV", "Girls Varsity", "Boys Varsity", "Overall"];

export function DivisionsManager({ activityId, divisions }: { activityId: string; divisions: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(syncDivisionsAction, null);
  const existingNames = divisions.map((d) => d.name);
  const existingByLower = new Set(existingNames.map((n) => n.toLowerCase()));
  // Any division that was created under a name outside the standard
  // presets still gets its own checkbox, so it can be unchecked to remove
  // it just like any other.
  const extras = existingNames.filter((n) => !PRESETS.some((p) => p.toLowerCase() === n.toLowerCase()));
  const options = [...PRESETS, ...extras];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Check every division this activity should have. Unchecking one removes it - blocked if it already has games
        scheduled on it.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="activityId" value={activityId} />
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {options.map((name) => (
            <label key={name} className="flex items-center gap-2">
              <input type="checkbox" name="divisionNames" value={name} defaultChecked={existingByLower.has(name.toLowerCase())} />
              {name}
            </label>
          ))}
        </div>
        <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1 text-xs">
          {pending ? "Saving…" : "Save divisions"}
        </button>
      </form>
      {state && !state.ok && <p className="text-xs text-danger">{state.error}</p>}
      {state?.ok && <p className="text-xs text-success">Saved!</p>}
    </div>
  );
}
