"use client";

import { useActionState } from "react";
import Image from "next/image";
import { uploadLiveResultsPhotoAction, deleteLiveResultsPhotoAction } from "@/lib/actions/live-results";

export function LiveResultsPhotoManager({
  tournamentId,
  photoUrl,
}: {
  tournamentId: string;
  photoUrl: string | null;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadLiveResultsPhotoAction, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteLiveResultsPhotoAction, null);

  return (
    <div className="space-y-2">
      <p className="field-label">Live results photo (optional)</p>

      {photoUrl && (
        <div className="relative h-32 w-full max-w-xs overflow-hidden border border-divider bg-foreground/5">
          <Image src={photoUrl} alt="Live results" fill sizes="320px" className="object-contain" />
        </div>
      )}

      <form action={uploadAction} className="flex items-center gap-2">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input name="photo" type="file" accept="image/*" className="field-input flex-1 text-xs" />
        <button type="submit" disabled={uploadPending} className="btn btn-secondary shrink-0 px-2 py-1 text-xs">
          {uploadPending ? "Uploading…" : photoUrl ? "Replace" : "Upload"}
        </button>
      </form>

      {photoUrl && (
        <form action={deleteAction}>
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <button type="submit" disabled={deletePending} className="btn btn-danger px-2 py-1 text-xs">
            Remove photo
          </button>
        </form>
      )}

      {uploadState && !uploadState.ok && <p className="text-xs text-danger">{uploadState.error}</p>}
      {deleteState && !deleteState.ok && <p className="text-xs text-danger">{deleteState.error}</p>}
    </div>
  );
}
