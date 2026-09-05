"use client";

import { useActionState, useState, useTransition } from "react";
import { resetPasswordAction, setUserDisabledAction } from "@/lib/actions/users";

type Props = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "EDITOR";
    schoolName: string | null;
    isDisabled: boolean;
    isSelf: boolean;
  };
};

export function UserRow({ user }: Props) {
  const [showReset, setShowReset] = useState(false);
  const [resetState, resetAction, resetPending] = useActionState(resetPasswordAction, null);
  const [isPending, startTransition] = useTransition();
  const [disabled, setDisabled] = useState(user.isDisabled);

  function toggleDisabled() {
    const next = !disabled;
    startTransition(async () => {
      const result = await setUserDisabledAction(user.id, next);
      if (result.ok) setDisabled(next);
    });
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {user.name} <span className="font-normal text-muted">({user.email})</span>
          </p>
          <p className="text-sm text-muted">
            {user.role === "ADMIN" ? "League admin" : `School editor · ${user.schoolName ?? "no school"}`}
            {disabled && <span className="ml-2 badge bg-red-100 text-red-800">Disabled</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary px-3 py-1 text-sm" onClick={() => setShowReset((v) => !v)}>
            Reset password
          </button>
          {!user.isSelf && (
            <button
              type="button"
              disabled={isPending}
              onClick={toggleDisabled}
              className={disabled ? "btn btn-primary px-3 py-1 text-sm" : "btn btn-danger px-3 py-1 text-sm"}
            >
              {disabled ? "Enable" : "Disable"}
            </button>
          )}
        </div>
      </div>

      {showReset && (
        <form action={resetAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <input type="hidden" name="userId" value={user.id} />
          <div>
            <label className="field-label">New password (leave blank to auto-generate)</label>
            <input name="newPassword" type="text" minLength={10} className="field-input w-64" />
          </div>
          <button type="submit" disabled={resetPending} className="btn btn-primary px-3 py-2 text-sm">
            {resetPending ? "Saving…" : "Reset"}
          </button>
        </form>
      )}
      {resetState && !resetState.ok && <p className="mt-2 text-sm text-danger">{resetState.error}</p>}
      {resetState?.ok && (
        <div className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          Password reset.
          {resetState.tempPassword && (
            <>
              {" "}
              New temporary password:{" "}
              <code className="rounded bg-white px-2 py-1 font-mono text-foreground">{resetState.tempPassword}</code>
            </>
          )}{" "}
          Share it with them directly. It won&apos;t be shown again.
        </div>
      )}
    </li>
  );
}
