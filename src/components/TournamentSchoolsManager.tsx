"use client";

import { useActionState } from "react";
import { syncTournamentSchoolsAction } from "@/lib/actions/tournaments";

type RosterOption = {
  id: string;
  name: string;
  isLeagueMember: boolean;
  participating: boolean;
};

export function TournamentSchoolsManager({
  tournamentId,
  schools,
}: {
  tournamentId: string;
  schools: RosterOption[];
}) {
  const [state, formAction, pending] = useActionState(syncTournamentSchoolsAction, null);
  const members = schools.filter((s) => s.isLeagueMember);
  const guests = schools.filter((s) => !s.isLeagueMember);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Check every school taking part. League schools start checked; guest schools start unchecked and are only in
        this tournament if you tick them. Unchecking a school takes it off this tournament&apos;s team photo board and
        its public school list &mdash; it doesn&apos;t delete anything, and adding the school to a game or naming it in
        a schedule CSV puts it straight back.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        {schools.map((s) => (
          <input key={s.id} type="hidden" name="schoolIds" value={s.id} />
        ))}

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {members.map((s) => (
            <label key={s.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                name="participatingSchoolIds"
                value={s.id}
                defaultChecked={s.participating}
                className="mt-1"
              />
              {s.name}
            </label>
          ))}
        </div>

        {guests.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Guest schools</p>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {guests.map((s) => (
                <label key={s.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="participatingSchoolIds"
                    value={s.id}
                    defaultChecked={s.participating}
                    className="mt-1"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1 text-xs">
          {pending ? "Saving…" : "Save participating schools"}
        </button>
      </form>
      {state && !state.ok && <p className="text-xs text-danger">{state.error}</p>}
      {state?.ok && <p className="text-xs text-success">Saved!</p>}
    </div>
  );
}
