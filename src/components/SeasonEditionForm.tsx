"use client";

import { useActionState, useId } from "react";
import { createTournamentAction, updateTournamentAction } from "@/lib/actions/tournaments";

type ExistingSeason = {
  id: string;
  name: string;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  hostSchoolId: string | null;
  archived: boolean;
  liveResultsUrl: string | null;
  liveResultsText: string | null;
};

export function SeasonEditionForm({
  activityId,
  schools,
  existing,
  isFirstEdition,
  showLiveResults,
}: {
  activityId: string;
  schools: { id: string; name: string }[];
  existing?: ExistingSeason;
  isFirstEdition?: boolean;
  showLiveResults?: boolean;
}) {
  // Prefixed ids: this form shares a page with the activity form, which
  // has its own "name" and "slug" fields.
  const fid = useId();
  const action = existing ? updateTournamentAction : createTournamentAction;
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <input type="hidden" name="activityId" value={activityId} />
      {existing && <input type="hidden" name="tournamentId" value={existing.id} />}

      {!existing && !isFirstEdition && (
        <p className="bg-primary-tint px-3 py-2 text-sm text-primary">
          Starting a new tournament archives the current one. Its schedule, results, and photos stay exactly as
          they are, just no longer shown as the active tournament.
        </p>
      )}

      <div>
        <label htmlFor={`${fid}-name`} className="field-label">
          Tournament name
        </label>
        <input id={`${fid}-name`} name="name" required placeholder="Fall 2026" defaultValue={existing?.name} className="field-input" />
      </div>
      {!existing && (
        <div>
          <label htmlFor={`${fid}-slug`} className="field-label">
            URL slug
          </label>
          <input id={`${fid}-slug`} name="slug" required placeholder="jv-volleyball-fall-2026" pattern="[a-z0-9-]+" className="field-input" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${fid}-startDate`} className="field-label">
            Start date
          </label>
          <input
            id={`${fid}-startDate`}
            name="startDate"
            type="date"
            required
            defaultValue={existing?.startDate}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-endDate`} className="field-label">
            End date
          </label>
          <input id={`${fid}-endDate`} name="endDate" type="date" required defaultValue={existing?.endDate} className="field-input" />
        </div>
      </div>
      <div>
        <label htmlFor={`${fid}-hostSchoolId`} className="field-label">
          Host school (optional)
        </label>
        <select
          key={existing?.hostSchoolId ?? ""}
          id={`${fid}-hostSchoolId`}
          name="hostSchoolId"
          defaultValue={existing?.hostSchoolId ?? ""}
          className="field-input"
        >
          <option value="">No host set</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" defaultChecked={existing?.archived ?? false} />
          Archived
        </label>
        <p className="mt-1 text-xs text-muted">
          Shows an &quot;Archived&quot; tag on this tournament&apos;s public pages. Off by default: a tournament
          isn&apos;t archived just because a newer one exists.
        </p>
      </div>

      {showLiveResults && (
        <div className="border-t border-divider pt-4">
          <p className="field-label">Live results (optional)</p>
          <p className="mt-1 text-xs text-muted">
            Shown on the tournament page. A meet doesn&apos;t always have a hosted results site - it might just be a
            photo of a printed sheet, or a few lines of text. Fill in whichever applies; when more than one is set,
            a photo is shown first, then text, then the link. Upload a photo from the tournament&apos;s own page in
            the admin list.
          </p>
          <div className="mt-2">
            <label htmlFor={`${fid}-liveResultsUrl`} className="field-label">
              Link
            </label>
            <input
              id={`${fid}-liveResultsUrl`}
              name="liveResultsUrl"
              type="url"
              placeholder="https://results.example.com/meet-123"
              defaultValue={existing?.liveResultsUrl ?? ""}
              className="field-input"
            />
          </div>
          <div className="mt-3">
            <label htmlFor={`${fid}-liveResultsText`} className="field-label">
              Text
            </label>
            <textarea
              id={`${fid}-liveResultsText`}
              name="liveResultsText"
              rows={3}
              placeholder="Girls 200 Free Relay: 1. ICS, 2. ABA, 3. AES..."
              defaultValue={existing?.liveResultsText ?? ""}
              className="field-input"
            />
          </div>
        </div>
      )}

      {state && !state.ok && (
        <p role="alert" className="bg-danger-tint px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="bg-success-tint px-3 py-2 text-sm text-success">Saved!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : existing ? "Save changes" : "Start this tournament"}
      </button>
    </form>
  );
}
