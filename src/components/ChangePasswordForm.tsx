"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction } from "@/lib/actions/auth";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changeOwnPasswordAction, null);

  if (state?.ok) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
        Password updated. Please <a href="/login" className="underline">log in again</a> with your new password.
      </p>
    );
  }

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="currentPassword" className="field-label">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="field-input"
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="field-label">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className="field-input"
        />
        <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
      </div>
      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
