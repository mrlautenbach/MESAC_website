"use client";

import { useActionState, useState } from "react";
import { createUserAction } from "@/lib/actions/users";

export function CreateUserForm({ schools }: { schools: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createUserAction, null);
  const [role, setRole] = useState<"EDITOR" | "ADMIN">("EDITOR");

  return (
    <div className="space-y-3">
      <form action={formAction} className="max-w-md space-y-3">
        <div>
          <label className="field-label">Name</label>
          <input name="name" required className="field-input" />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input name="email" type="email" required className="field-input" />
        </div>
        <div>
          <label className="field-label">Role</label>
          <select
            name="role"
            className="field-input"
            value={role}
            onChange={(e) => setRole(e.target.value as "EDITOR" | "ADMIN")}
          >
            <option value="EDITOR">School editor</option>
            <option value="ADMIN">League admin</option>
          </select>
        </div>
        {role === "EDITOR" && (
          <div>
            <label className="field-label">School</label>
            <select name="schoolId" required className="field-input">
              <option value="">Select a school…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>

      {state?.ok && state.tempPassword && (
        <div className="max-w-md rounded-md bg-green-50 px-3 py-3 text-sm text-success">
          <p className="font-semibold">Account created.</p>
          <p className="mt-1">
            Temporary password: <code className="rounded bg-white px-2 py-1 font-mono text-foreground">{state.tempPassword}</code>
          </p>
          <p className="mt-1 text-xs">
            Share this with the school directly (phone or in person, not email if possible). They&apos;ll be asked to set
            their own password the first time they log in. This won&apos;t be shown again.
          </p>
        </div>
      )}
    </div>
  );
}
