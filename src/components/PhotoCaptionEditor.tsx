"use client";

import { useActionState } from "react";
import Image from "next/image";
import { updatePhotoCaptionAction, setPhotoFeaturedAction, deletePhotoAction } from "@/lib/actions/photos";

type Props = {
  photo: { id: string; url: string; caption: string | null; altText: string | null; featuredOnHome: boolean };
  canDelete: boolean;
};

export function PhotoCaptionEditor({ photo, canDelete }: Props) {
  const [state, formAction, pending] = useActionState(updatePhotoCaptionAction, null);
  const [featuredState, featuredAction] = useActionState(setPhotoFeaturedAction, null);

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-square">
        <Image src={photo.url} alt={photo.altText || photo.caption || "Event photo"} fill sizes="200px" className="object-cover" />
      </div>
      <form action={formAction} className="space-y-1 p-2">
        <input type="hidden" name="photoId" value={photo.id} />
        <input
          type="text"
          name="caption"
          defaultValue={photo.caption ?? ""}
          placeholder="Caption"
          maxLength={300}
          className="field-input text-sm"
        />
        <input
          type="text"
          name="altText"
          defaultValue={photo.altText ?? ""}
          placeholder="Accessibility description"
          maxLength={300}
          className="field-input text-xs"
        />
        <div className="flex items-center justify-between pt-1">
          <button type="submit" disabled={pending} className="btn btn-secondary px-3 py-1 text-xs">
            {pending ? "Saving…" : "Save"}
          </button>
          {state?.ok && <span className="text-xs text-success">Saved</span>}
          {state && !state.ok && <span className="text-xs text-danger">{state.error}</span>}
        </div>
      </form>
      {canDelete && (
        <form action={featuredAction} className="border-t border-border p-2">
          <input type="hidden" name="photoId" value={photo.id} />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="featuredOnHome"
              defaultChecked={photo.featuredOnHome}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
            Show on homepage
          </label>
          {featuredState && !featuredState.ok && <span className="text-xs text-danger">{featuredState.error}</span>}
        </form>
      )}
      {canDelete && (
        <form
          action={async () => {
            await deletePhotoAction(photo.id);
          }}
          className="border-t border-border p-2"
        >
          <button type="submit" className="btn btn-danger w-full px-3 py-1 text-xs">
            Delete photo
          </button>
        </form>
      )}
    </div>
  );
}
