"use client";

import { useActionState, useId } from "react";
import { createHallOfFameAction } from "@/lib/actions/records";

export function HallOfFameForm({ schools }: { schools: { id: string; name: string }[] }) {
  const fid = useId();
  const [state, formAction, pending] = useActionState(createHallOfFameAction, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${fid}-name`} className="field-label">Name</label>
          <input id={`${fid}-name`} name="name" required placeholder="Full name" className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-classYear`} className="field-label">Class year</label>
          <input id={`${fid}-classYear`} name="classYear" type="number" required min={1900} max={2100} placeholder="2026" className="field-input" />
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
      <div>
        <label htmlFor={`${fid}-note`} className="field-label">Note</label>
        <textarea id={`${fid}-note`} name="note" required rows={3} maxLength={400} placeholder="What earned this induction" className="field-input" />
      </div>
      <div>
        <label htmlFor={`${fid}-photo`} className="field-label">Portrait (optional)</label>
        <input id={`${fid}-photo`} name="photo" type="file" accept="image/*" className="field-input" />
      </div>

      {state && !state.ok && <p className="bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="bg-success-tint px-3 py-2 text-sm text-success">Added!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Add to Hall of Fame"}
      </button>
    </form>
  );
}
