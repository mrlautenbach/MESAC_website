"use client";

import { useActionState } from "react";
import { createHallOfFameAction } from "@/lib/actions/records";

export function HallOfFameForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createHallOfFameAction, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">Name</label>
          <input name="name" required placeholder="Full name" className="field-input" />
        </div>
        <div>
          <label className="field-label">Class year</label>
          <input name="classYear" type="number" required min={1900} max={2100} placeholder="2026" className="field-input" />
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
      <div>
        <label className="field-label">Note</label>
        <textarea name="note" required rows={3} maxLength={400} placeholder="What earned this induction" className="field-input" />
      </div>
      <div>
        <label className="field-label">Portrait (optional)</label>
        <input name="photo" type="file" accept="image/*" className="field-input" />
      </div>

      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Added!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Add to Hall of Fame"}
      </button>
    </form>
  );
}
