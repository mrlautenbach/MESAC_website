"use client";

import { useActionState, useState, useId } from "react";
import { createUserAction } from "@/lib/actions/users";

export function CreateUserForm({ schools }: { schools: { id: string; name: string }[] }) {
  const fid = useId();
  const [state, formAction, pending] = useActionState(createUserAction, null);
  const [role, setRole] = useState<"EDITOR" | "ADMIN">("EDITOR");

  return (
    <div className="space-y-3">
      <form action={formAction} className="max-w-md space-y-3">
        <div>
          <label htmlFor={`${fid}-name`} className="field-label">Name</label>
          <input id={`${fid}-name`} name="name" required className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-email`} className="field-label">Email</label>
          <input id={`${fid}-email`} name="email" type="email" required className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-role`} className="field-label">Role</label>
          <select id={`${fid}-role`}
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
            <label htmlFor={`${fid}-schoolId`} className="field-label">School</label>
            <select id={`${fid}-schoolId`} name="schoolId" required className="field-input">
              <option value="">Select a school…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {state && !state.ok && <p className="bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>}

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>

      {state?.ok && state.tempPassword && (
        <div className="max-w-md bg-success-tint px-3 py-3 text-sm text-success">
          <p className="font-semibold">Account created.</p>
          <p className="mt-1">
            Temporary password: <code className="bg-card px-2 py-1 font-mono text-foreground">{state.tempPassword}</code>
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
