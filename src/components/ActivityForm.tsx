"use client";

import { useActionState, useState } from "react";
import { createActivityAction, updateActivityAction } from "@/lib/actions/activities";

type ScoringType = "WIN_LOSS" | "LOW_SCORE" | "NONE";

type ExistingActivity = {
  id: string;
  name: string;
  sport: string;
  scoringType: ScoringType;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  seasonId: string;
};

export function ActivityForm({
  seasons,
  existing,
}: {
  seasons: { id: string; name: string }[];
  existing?: ExistingActivity;
}) {
  const action = existing ? updateActivityAction : createActivityAction;
  const [state, formAction, pending] = useActionState(action, null);
  const [scoringType, setScoringType] = useState<ScoringType>(existing?.scoringType ?? "WIN_LOSS");

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {existing && <input type="hidden" name="activityId" value={existing.id} />}
      <div>
        <label htmlFor="seasonId" className="field-label">
          Season
        </label>
        <select id="seasonId" name="seasonId" required className="field-input" defaultValue={existing?.seasonId ?? seasons[0]?.id}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="name" className="field-label">
          Activity name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="JV Volleyball"
          defaultValue={existing?.name}
          className="field-input"
        />
      </div>
      {!existing && (
        <div>
          <label htmlFor="slug" className="field-label">
            URL slug
          </label>
          <input id="slug" name="slug" required placeholder="jv-volleyball" pattern="[a-z0-9-]+" className="field-input" />
          <p className="mt-1 text-xs text-muted">Lowercase letters, numbers, and hyphens only. Stays the same every year.</p>
        </div>
      )}
      <div>
        <label htmlFor="sport" className="field-label">
          Sport
        </label>
        <input id="sport" name="sport" required placeholder="Volleyball" defaultValue={existing?.sport} className="field-input" />
      </div>

      <div>
        <label htmlFor="scoringType" className="field-label">
          How are results scored?
        </label>
        <select
          id="scoringType"
          name="scoringType"
          className="field-input"
          value={scoringType}
          onChange={(e) => setScoringType(e.target.value as ScoringType)}
        >
          <option value="WIN_LOSS">Win / loss / draw per game (most team sports)</option>
          <option value="LOW_SCORE">Team + individual score, lowest wins (e.g. golf)</option>
          <option value="NONE">No results table — just post a results document (meets, festivals)</option>
        </select>
      </div>

      {scoringType === "WIN_LOSS" && (
        <div>
          <p className="field-label">Points awarded</p>
          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm">
              Win
              <input
                name="winPoints"
                type="number"
                min={0}
                max={100}
                defaultValue={existing?.winPoints ?? 3}
                className="field-input mt-1"
              />
            </label>
            <label className="text-sm">
              Draw
              <input
                name="drawPoints"
                type="number"
                min={0}
                max={100}
                defaultValue={existing?.drawPoints ?? 1}
                className="field-input mt-1"
              />
            </label>
            <label className="text-sm">
              Loss
              <input
                name="lossPoints"
                type="number"
                min={0}
                max={100}
                defaultValue={existing?.lossPoints ?? 0}
                className="field-input mt-1"
              />
            </label>
          </div>
        </div>
      )}

      {!existing && (
        <div>
          <p className="field-label">Divisions</p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="divisionNames" value="Girls" defaultChecked />
              Girls
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="divisionNames" value="Boys" defaultChecked />
              Boys
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">
            Uncheck both for a single activity with no Girls/Boys split (meets, festivals, or a sport that&apos;s
            already single-gender).
          </p>
        </div>
      )}

      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Saved!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : existing ? "Save changes" : "Create activity"}
      </button>
    </form>
  );
}
