"use client";

import { useActionState } from "react";
import { createSchoolAction, updateSchoolAction } from "@/lib/actions/schools";

type ExistingSchool = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  code: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
};

export function SchoolForm({ existing }: { existing?: ExistingSchool }) {
  const action = existing ? updateSchoolAction : createSchoolAction;
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3">
      {existing && <input type="hidden" name="schoolId" value={existing.id} />}
      <div>
        <label className="field-label">School name</label>
        <input name="name" required defaultValue={existing?.name} className="field-input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label">Contact name</label>
          <input name="contactName" defaultValue={existing?.contactName ?? ""} className="field-input" />
        </div>
        <div>
          <label className="field-label">Contact email</label>
          <input name="contactEmail" type="email" defaultValue={existing?.contactEmail ?? ""} className="field-input" />
        </div>
        <div>
          <label className="field-label">Contact phone</label>
          <input name="contactPhone" defaultValue={existing?.contactPhone ?? ""} className="field-input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="field-label">Short code</label>
          <input name="code" placeholder="ASD-DO" maxLength={12} defaultValue={existing?.code ?? ""} className="field-input" />
        </div>
        <div>
          <label className="field-label">City</label>
          <input name="city" placeholder="Doha, Qatar" defaultValue={existing?.city ?? ""} className="field-input" />
        </div>
        <div>
          <label className="field-label">Latitude</label>
          <input
            name="lat"
            type="number"
            step="any"
            placeholder="25.28"
            defaultValue={existing?.lat ?? ""}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Longitude</label>
          <input
            name="lon"
            type="number"
            step="any"
            placeholder="51.49"
            defaultValue={existing?.lon ?? ""}
            className="field-input"
          />
        </div>
      </div>
      <p className="text-xs text-muted">
        Code, city, and coordinates are optional — they power the Schools Atlas map. Leave blank to omit a school
        from the map.
      </p>
      <div>
        <label className="field-label">Logo (optional)</label>
        <input name="logo" type="file" accept="image/*" className="field-input" />
      </div>

      {state && !state.ok && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Saved!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : existing ? "Save changes" : "Add school"}
      </button>
    </form>
  );
}
