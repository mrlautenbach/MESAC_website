"use client";

import { useActionState, useState, useId } from "react";
import { createSchoolAction, updateSchoolAction } from "@/lib/actions/schools";

const DEFAULT_THEME_COLOR = "#2a6a8a";
const DEFAULT_THEME_COLOR_SECONDARY = "#cbbd93";

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
  themeColor: string | null;
  themeColorSecondary: string | null;
  teamCount: number;
  isLeagueMember: boolean;
};

export function SchoolForm({ existing }: { existing?: ExistingSchool }) {
  const fid = useId();
  const action = existing ? updateSchoolAction : createSchoolAction;
  const [state, formAction, pending] = useActionState(action, null);
  const [themeColor, setThemeColor] = useState(existing?.themeColor ?? DEFAULT_THEME_COLOR);
  const [hasSecondary, setHasSecondary] = useState(!!existing?.themeColorSecondary);
  const [themeColorSecondary, setThemeColorSecondary] = useState(
    existing?.themeColorSecondary ?? DEFAULT_THEME_COLOR_SECONDARY
  );

  return (
    <form action={formAction} className="space-y-3">
      {existing && <input type="hidden" name="schoolId" value={existing.id} />}
      <div>
        <label htmlFor={`${fid}-name`} className="field-label">School name</label>
        <input id={`${fid}-name`} name="name" required defaultValue={existing?.name} className="field-input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${fid}-contactName`} className="field-label">Contact name</label>
          <input id={`${fid}-contactName`} name="contactName" defaultValue={existing?.contactName ?? ""} className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-contactEmail`} className="field-label">Contact email</label>
          <input id={`${fid}-contactEmail`} name="contactEmail" type="email" defaultValue={existing?.contactEmail ?? ""} className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-contactPhone`} className="field-label">Contact phone</label>
          <input id={`${fid}-contactPhone`} name="contactPhone" defaultValue={existing?.contactPhone ?? ""} className="field-input" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <div>
          <label htmlFor={`${fid}-code`} className="field-label">Short code</label>
          <input id={`${fid}-code`} name="code" placeholder="ASD-DO" maxLength={12} defaultValue={existing?.code ?? ""} className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-city`} className="field-label">City</label>
          <input id={`${fid}-city`} name="city" placeholder="Doha, Qatar" defaultValue={existing?.city ?? ""} className="field-input" />
        </div>
        <div>
          <label htmlFor={`${fid}-lat`} className="field-label">Latitude</label>
          <input id={`${fid}-lat`}
            name="lat"
            type="number"
            step="any"
            placeholder="25.28"
            defaultValue={existing?.lat ?? ""}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-lon`} className="field-label">Longitude</label>
          <input id={`${fid}-lon`}
            name="lon"
            type="number"
            step="any"
            placeholder="51.49"
            defaultValue={existing?.lon ?? ""}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-teamCount`} className="field-label">Teams</label>
          <input id={`${fid}-teamCount`}
            name="teamCount"
            type="number"
            min={0}
            max={999}
            step={1}
            defaultValue={existing?.teamCount ?? 0}
            className="field-input"
          />
        </div>
      </div>
      <p className="text-xs text-muted">
        Code, city, and coordinates are optional. They power the Schools Atlas map. Leave blank to omit a school
        from the map. Teams is the number shown on the public schools page.
      </p>
      <div className="border border-border p-3">
        <label className="flex items-start gap-2.5 text-sm font-semibold">
          <input
            type="checkbox"
            name="isLeagueMember"
            defaultChecked={existing?.isLeagueMember ?? true}
            className="mt-0.5"
          />
          League member
        </label>
        <p className="mt-1.5 pl-6 text-xs text-muted">
          Ticked, the school appears everywhere &mdash; the home page, the footer, and the schools directory.
          Unticked, it&apos;s a guest: it can still be added to any tournament and shows up on that tournament&apos;s
          schedule, results, and team photos, but it isn&apos;t listed as part of the league.
        </p>
      </div>
      <div>
        <label htmlFor={`${fid}-logo`} className="field-label">Logo (optional)</label>
        <input id={`${fid}-logo`} name="logo" type="file" accept="image/*" className="field-input" />
      </div>

      <div>
        <label htmlFor={`${fid}-themeColor`} className="field-label">
          Primary brand color (optional)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            className="h-9 w-12 shrink-0 cursor-pointer border border-border p-0"
            aria-label="Primary brand color"
          />
          <input
            id={`${fid}-themeColor`}
            name="themeColor"
            value={themeColor}
            onChange={(e) => setThemeColor(e.target.value)}
            placeholder="#2A6A8A"
            maxLength={7}
            className="field-input"
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          Shown next to this school&apos;s name in standings, schedules, and the schools directory.
        </p>
      </div>

      {hasSecondary ? (
        <div>
          <label htmlFor={`${fid}-themeColorSecondary`} className="field-label">
            Secondary brand color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={themeColorSecondary}
              onChange={(e) => setThemeColorSecondary(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer border border-border p-0"
              aria-label="Secondary brand color"
            />
            <input
              id={`${fid}-themeColorSecondary`}
              name="themeColorSecondary"
              value={themeColorSecondary}
              onChange={(e) => setThemeColorSecondary(e.target.value)}
              placeholder="#CBBD93"
              maxLength={7}
              className="field-input"
            />
            <button
              type="button"
              onClick={() => setHasSecondary(false)}
              className="btn btn-secondary shrink-0 px-3 py-2 text-xs"
            >
              Remove
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">Shown alongside the primary color, e.g. as a two-tone swatch.</p>
        </div>
      ) : (
        <>
          <input type="hidden" name="themeColorSecondary" value="" />
          <button type="button" onClick={() => setHasSecondary(true)} className="btn btn-secondary text-xs">
            + Add a secondary color
          </button>
        </>
      )}

      {state && !state.ok && <p className="bg-danger-tint px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="bg-success-tint px-3 py-2 text-sm text-success">Saved!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : existing ? "Save changes" : "Add school"}
      </button>
    </form>
  );
}
