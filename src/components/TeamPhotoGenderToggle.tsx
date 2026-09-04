"use client";

import { useActionState } from "react";
import { setTournamentGenderVisibilityAction } from "@/lib/actions/team-photos";

export function TeamPhotoGenderToggle({
  tournamentId,
  showGirlsTeamPhotos,
  showBoysTeamPhotos,
}: {
  tournamentId: string;
  showGirlsTeamPhotos: boolean;
  showBoysTeamPhotos: boolean;
}) {
  const [state, formAction, pending] = useActionState(setTournamentGenderVisibilityAction, null);

  return (
    <form
      action={formAction}
      className="card mb-4 flex flex-wrap items-center gap-4 p-3 text-sm"
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <span className="font-semibold">Sections shown:</span>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name="showGirlsTeamPhotos" defaultChecked={showGirlsTeamPhotos} disabled={pending} />
        Girls
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name="showBoysTeamPhotos" defaultChecked={showBoysTeamPhotos} disabled={pending} />
        Boys
      </label>
      <span className="text-xs text-muted">
        Turn a gender off if it isn&apos;t fielded this year — schools then show the other gender&apos;s photo, or
        just their name if both are off.
      </span>
      {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
