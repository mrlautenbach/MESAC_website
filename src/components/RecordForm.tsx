"use client";

import { useActionState } from "react";
import { createRecordAction } from "@/lib/actions/records";

export function RecordForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createRecordAction, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">Sport</label>
          <input name="sport" required placeholder="Swimming" className="field-input" />
        </div>
        <div>
          <label className="field-label">Event / category</label>
          <input name="eventName" required placeholder="200m freestyle" className="field-input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label">Mark</label>
          <input name="mark" required placeholder="1:52.09" className="field-input" />
        </div>
        <div>
          <label className="field-label">Athlete</label>
          <input name="athleteName" required placeholder="Nadia Haddad" className="field-input" />
        </div>
        <div>
          <label className="field-label">Year set</label>
          <input name="year" type="number" required min={1900} max={2100} placeholder="2011" className="field-input" />
        </div>
      </div>
      <div>
        <label className="field-label">School (optional)</label>
        <select name="schoolId" className="field-input" defaultValue="">
          <option value="">Not specified</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Added!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Add record"}
      </button>
    </form>
  );
}
