"use client";

import { useActionState, useState } from "react";
import { deleteActivityAction } from "@/lib/actions/activities";

export function DeleteActivityForm({ activityId, activityName }: { activityId: string; activityName: string }) {
  const [state, formAction, pending] = useActionState(deleteActivityAction, null);
  const [confirmName, setConfirmName] = useState("");

  return (
    <div className="space-y-2 border border-danger/40 bg-danger/5 p-3">
      <p className="text-xs text-danger">
        Permanently deletes this activity and everything under it - every tournament edition, game, result, photo,
        and document. Its public pages stop working entirely. This can&apos;t be undone.
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="activityId" value={activityId} />
        <div>
          <label className="field-label" htmlFor={`${activityId}-confirm-name`}>
            Type &quot;{activityName}&quot; to confirm
          </label>
          <input
            id={`${activityId}-confirm-name`}
            name="confirmName"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
            className="field-input w-56 py-1 text-sm"
          />
        </div>
        <button type="submit" disabled={pending || confirmName !== activityName} className="btn btn-danger px-3 py-1 text-xs">
          {pending ? "Deleting…" : "Delete activity permanently"}
        </button>
      </form>
      {state && !state.ok && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}
