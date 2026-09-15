"use client";

import { useActionState } from "react";
import { setTournamentCurrentAction } from "@/lib/actions/tournaments";

export function SetTournamentCurrentButton({ tournamentId }: { tournamentId: string }) {
  const [state, formAction, pending] = useActionState(setTournamentCurrentAction, null);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <button type="submit" disabled={pending} className="text-xs font-semibold text-primary hover:underline disabled:opacity-50">
        {pending ? "Making current…" : "Make current"}
      </button>
      {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
