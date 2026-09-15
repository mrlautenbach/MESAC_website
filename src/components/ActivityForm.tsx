"use client";

import { useActionState, useMemo, useState } from "react";
import { createActivityAction, updateActivityAction } from "@/lib/actions/activities";

type ScoringType = "WIN_LOSS" | "LOW_SCORE" | "NONE";

// One event_number appearing twice (in different sessions) is how a
// prelim/final pair is expressed - see MeetScheduleImportForm for the full
// column docs shown once the activity (and its divisions) actually exist.
const MEET_SCHEDULE_TEMPLATE =
  "date,session,event_number,round,event_name,gender,location,status,live_stream,time\n" +
  "2026-09-12,Day 1 Prelims,1,prelim,100m Freestyle,Girls,Aquatics Center,SCHEDULED,,09:00\n" +
  "2026-09-12,Day 1 Finals,1,final,100m Freestyle,Girls,Aquatics Center,SCHEDULED,https://example.com/live,18:00\n" +
  "2026-09-12,Day 1 Finals,2,,200m Individual Medley,Girls,Aquatics Center,SCHEDULED,,18:20\n";
const MEET_RESULTS_TEMPLATE =
  "event_name,round,place,name,school,mark,seed,prelim_time,points,record\n" +
  "100m Freestyle,final,1,Jane Doe,ASD,58.21,,59.02,9,MR\n";

type ExistingActivity = {
  id: string;
  name: string;
  sport: string;
  scoringType: ScoringType;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  seasonId: string;
  showWins: boolean;
  showLosses: boolean;
  showPointsFor: boolean;
  showPointsAgainst: boolean;
  showPlayed: boolean;
  usesSetScores: boolean;
  usesMeetResults: boolean;
  usesLiveResults: boolean;
};

export function ActivityForm({
  seasons,
  schools,
  existing,
}: {
  seasons: { id: string; name: string }[];
  schools: { id: string; name: string }[];
  existing?: ExistingActivity;
}) {
  const action = existing ? updateActivityAction : createActivityAction;
  const [state, formAction, pending] = useActionState(action, null);
  const [scoringType, setScoringType] = useState<ScoringType>(existing?.scoringType ?? "WIN_LOSS");
  const [usesMeetResults, setUsesMeetResults] = useState(existing?.usesMeetResults ?? false);

  const fileSlug = (existing?.name || "activity").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const scheduleTemplateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(MEET_SCHEDULE_TEMPLATE)}`,
    []
  );
  const resultsTemplateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(MEET_RESULTS_TEMPLATE)}`,
    []
  );

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
          <option value="NONE">No results table, just post a results document (meets, festivals)</option>
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="usesLiveResults" defaultChecked={existing?.usesLiveResults ?? false} />
          Uses live results (e.g. swimming, track &amp; field, wrestling, cross country)
        </label>
        <p className="mt-1 text-xs text-muted">
          Adds a Live results link/text/photo field to each tournament, shown on its public page. Off by default -
          most team sports just use the regular schedule/results tables instead.
        </p>
      </div>

      {scoringType === "NONE" && (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="usesMeetResults"
              checked={usesMeetResults}
              onChange={(e) => setUsesMeetResults(e.target.checked)}
            />
            Uses meet-style results (e.g. swimming, track &amp; field)
          </label>
          <p className="mt-1 text-xs text-muted">
            Adds one combined CSV to set up sessions and the named-event program together, plus a separate CSV per
            session for individual placings (event name, place, name, school, time/mark, points, record notation) -
            in addition to, not instead of, the results document above.
          </p>
          {usesMeetResults && (
            <div className="mt-2 flex flex-wrap gap-3">
              <a href={scheduleTemplateHref} download={`${fileSlug}-meet-schedule-template.csv`} className="btn btn-secondary">
                Download blank schedule &amp; program CSV template
              </a>
              <a href={resultsTemplateHref} download={`${fileSlug}-meet-results-template.csv`} className="btn btn-secondary">
                Download blank results CSV template
              </a>
            </div>
          )}
        </div>
      )}

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

      {scoringType === "WIN_LOSS" && (
        <div>
          <p className="field-label">Results table columns</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showWins" defaultChecked={existing?.showWins ?? true} />
              Wins
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showLosses" defaultChecked={existing?.showLosses ?? true} />
              Losses
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showPointsFor" defaultChecked={existing?.showPointsFor ?? true} />
              Points For
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showPointsAgainst" defaultChecked={existing?.showPointsAgainst ?? true} />
              Points Against
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showPlayed" defaultChecked={existing?.showPlayed ?? true} />
              Games Played
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">Team Name is always shown. Turn off any of these to simplify the table.</p>
        </div>
      )}

      {scoringType === "WIN_LOSS" && (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="usesSetScores" defaultChecked={existing?.usesSetScores ?? false} />
            Matches are decided by sets (e.g. volleyball)
          </label>
          <p className="mt-1 text-xs text-muted">
            Adds a per-set score editor to each game, and uses the total points across sets for Points For/Against
            instead of the win/loss score.
          </p>
        </div>
      )}

      {!existing && (
        <div>
          <p className="field-label">Divisions</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {usesMeetResults ? (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Junior Varsity" />
                  Junior Varsity
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Varsity" />
                  Varsity
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Overall" />
                  Overall
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Girls" defaultChecked />
                  Girls
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Boys" defaultChecked />
                  Boys
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Girls JV" />
                  Girls JV
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Boys JV" />
                  Boys JV
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Girls Varsity" />
                  Girls Varsity
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Boys Varsity" />
                  Boys Varsity
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="JV" />
                  JV
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Varsity" />
                  Varsity
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="divisionNames" value="Overall" />
                  Overall
                </label>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {usesMeetResults ? (
              <>
                Divisions here are skill level only - Girls/Boys is tracked separately via the Gender column on the
                schedule and program CSVs, so a division shouldn&apos;t also name a gender. Pick any combination, or
                leave unchecked for a single ungendered activity with no split. &quot;JV&quot; on a CSV always means
                Junior Varsity, whichever spelling you pick here. More divisions can be added later from the
                activity&apos;s own page.
              </>
            ) : (
              <>
                Pick any combination - e.g. just Girls/Boys, split further by JV and Varsity, or add Overall alongside
                them. Uncheck all for a single activity with no split (meets, festivals, or a sport that&apos;s
                already single-gender). More divisions can be added later from the activity&apos;s own page.
              </>
            )}
          </p>
        </div>
      )}

      {!existing && (
        <div className="space-y-4 border-t border-divider pt-4">
          <p className="field-label">First tournament</p>
          <p className="-mt-2 text-xs text-muted">
            An activity isn&apos;t a real page until it has an edition - this creates both together. Hosting rotates
            every year, so it&apos;s set here per-tournament, not on the activity.
          </p>
          <div>
            <label htmlFor="tournamentName" className="field-label">
              Tournament name
            </label>
            <input id="tournamentName" name="tournamentName" required placeholder="Fall 2026" className="field-input" />
          </div>
          <div>
            <label htmlFor="tournamentSlug" className="field-label">
              Tournament URL slug
            </label>
            <input
              id="tournamentSlug"
              name="tournamentSlug"
              required
              placeholder="jv-volleyball-fall-2026"
              pattern="[a-z0-9-]+"
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tournamentStartDate" className="field-label">
                Start date
              </label>
              <input id="tournamentStartDate" name="tournamentStartDate" type="date" required className="field-input" />
            </div>
            <div>
              <label htmlFor="tournamentEndDate" className="field-label">
                End date
              </label>
              <input id="tournamentEndDate" name="tournamentEndDate" type="date" required className="field-input" />
            </div>
          </div>
          <div>
            <label htmlFor="tournamentHostSchoolId" className="field-label">
              Host school (optional)
            </label>
            <select id="tournamentHostSchoolId" name="tournamentHostSchoolId" defaultValue="" className="field-input">
              <option value="">No host set</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {state && !state.ok && (
        <p role="alert" className="bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="bg-green-50 px-3 py-2 text-sm text-success">Saved!</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : existing ? "Save changes" : "Create activity"}
      </button>
    </form>
  );
}
