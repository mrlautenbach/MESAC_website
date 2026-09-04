"use client";

import { useActionState } from "react";
import { updateSchoolYearResultsAction } from "@/lib/actions/records";

export function SchoolYearResultsForm({ id, resultsUrl }: { id: string; resultsUrl: string | null }) {
  const [state, formAction, pending] = useActionState(updateSchoolYearResultsAction, null);

  return (
    <form action={formAction} className="flex flex-1 items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="resultsUrl"
        type="url"
        placeholder="https://…"
        defaultValue={resultsUrl ?? ""}
        className="field-input flex-1"
      />
      <button type="submit" disabled={pending} className="btn btn-secondary shrink-0 px-3 py-2 text-xs">
        {pending ? "Saving…" : "Save"}
      </button>
      {state && !state.ok && <span className="shrink-0 text-xs text-danger">{state.error}</span>}
      {state?.ok && <span className="shrink-0 text-xs text-success">Saved</span>}
    </form>
  );
}
