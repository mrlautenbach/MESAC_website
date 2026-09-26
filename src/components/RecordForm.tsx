"use client";

import { useActionState, useId } from "react";
import { createRecordAction } from "@/lib/actions/records";

export function RecordForm({ schools }: { schools: { id: string; name: string }[] }) {
  const fid = useId();
  const [state, formAction, pending] = useActionState(createRecordAction, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fid}-sport`} className="field-label">Sport</label>
          <input id={`${fid}-sport`} name="sport" required placeholder="Swimming" className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-eventName`} className="field-label">Event / category</label>
          <input id={`${fid}-eventName`} name="eventName" required placeholder="200m freestyle" className="field-input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${fid}-mark`} className="field-label">Mark</label>
          <input id={`${fid}-mark`} name="mark" required placeholder="1:52.09" className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-athleteName`} className="field-label">Athlete</label>
          <input id={`${fid}-athleteName`} name="athleteName" required placeholder="Nadia Haddad" className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-year`} className="field-label">Year set</label>
          <input id={`${fid}-year`} name="year" type="number" required min={1900} max={2100} placeholder="2011" className="field-input" />
        </div>
      </div>
      <div>
        <label htmlFor={`${fid}-schoolId`} className="field-label">School (optional)</label>
        <select id={`${fid}-schoolId`} name="schoolId" className="field-input" defaultValue="">
          <option value="">Not specified</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state && !state.ok && <p className="bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="bg-success-tint px-3 py-2 text-sm text-success">Added!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Add record"}
      </button>
    </form>
  );
}
