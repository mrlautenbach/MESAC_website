"use client";

import { useActionState } from "react";
import Image from "next/image";
import {
  setTeamPhotoEnabledAction,
  uploadTeamPhotoAction,
  deleteTeamPhotoAction,
} from "@/lib/actions/team-photos";

export function TeamPhotoSlot({
  tournamentId,
  schoolId,
  schoolName,
  divisionId,
  enabled,
  photoUrl,
}: {
  tournamentId: string;
  schoolId: string;
  schoolName: string;
  divisionId: string | null;
  enabled: boolean;
  photoUrl: string | null;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(setTeamPhotoEnabledAction, null);
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadTeamPhotoAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTeamPhotoAction, null);

  const hiddenFields = (
    <>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="divisionId" value={divisionId ?? ""} />
    </>
  );

  return (
    <div className="card space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{schoolName}</span>
        <form action={toggleAction}>
          {hiddenFields}
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              disabled={togglePending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            Fielding a team
          </label>
        </form>
      </div>

      {photoUrl && (
        <div className="relative h-24 w-full overflow-hidden border border-divider bg-foreground/5">
          <Image src={photoUrl} alt={schoolName} fill className="object-cover" />
        </div>
      )}

      <form action={uploadAction} className="flex items-center gap-2">
        {hiddenFields}
        <input name="photo" type="file" accept="image/*" className="field-input flex-1 text-xs" />
        <button type="submit" disabled={uploadPending} className="btn btn-secondary shrink-0 px-2 py-1 text-xs">
          {uploadPending ? "Uploading…" : photoUrl ? "Replace" : "Upload"}
        </button>
      </form>

      {photoUrl && (
        <form action={deleteAction}>
          {hiddenFields}
          <button type="submit" disabled={deletePending} className="btn btn-danger px-2 py-1 text-xs">
            Remove photo
          </button>
        </form>
      )}

      {toggleState && !toggleState.ok && <p className="text-xs text-danger">{toggleState.error}</p>}
      {uploadState && !uploadState.ok && <p className="text-xs text-danger">{uploadState.error}</p>}
      {deleteState && !deleteState.ok && <p className="text-xs text-danger">{deleteState.error}</p>}
    </div>
  );
}
