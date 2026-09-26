"use client";

import { useCsvText } from "@/components/useCsvText";
import { useActionState, useState } from "react";
import { importEventsAction, type ImportEventsResult } from "@/lib/actions/events";
import { AddNewSchoolsCheckbox, NewSchoolsNote } from "@/components/NewSchoolsImport";
import { CsvImportErrors } from "@/components/CsvImportOutcome";

type SeasonOption = {
  id: string;
  label: string;
  divisions: { id: string; name: string }[];
  fields: { id: string; key: string; label: string }[];
};

type Props = {
  seasons: SeasonOption[];
  schoolCodes: { code: string; name: string }[];
  defaultTournamentId?: string;
  // Only admins can add schools, so only they get the "add unknown schools" option.
  canAddSchools?: boolean;
};

// Meet-style activities (Swimming, Track & Field) set up their schedule via
// the combined schedule+program CSV instead - see MeetScheduleImportForm.
export function EventImportForm({ seasons, schoolCodes, defaultTournamentId, canAddSchools = false }: Props) {
  const [state, formAction, pending] = useActionState<ImportEventsResult | null, FormData>(importEventsAction, null);
  const csvText = useCsvText(state);
  const [tournamentId, setTournamentId] = useState(
    (defaultTournamentId && seasons.some((s) => s.id === defaultTournamentId) ? defaultTournamentId : seasons[0]?.id) ?? ""
  );
  const season = seasons.find((s) => s.id === tournamentId);

  const exampleHref = `/dashboard/admin/events/import/example?tournament=${tournamentId}`;

  if (state?.ok) {
    return (
      <div className="bg-success-tint px-4 py-3 text-sm text-success">
        Imported {state.created} new game
        {state.created === 1 ? "" : "s"}
        {state.updated > 0 && `, updated ${state.updated} existing game${state.updated === 1 ? "" : "s"}`}
        {state.removed > 0 && `, and removed ${state.removed} game${state.removed === 1 ? "" : "s"} no longer in the file`}. Refresh
        the schedule to see them, or{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          import another file
        </button>
        .
        <NewSchoolsNote names={state.newSchools} />
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <div>
        <label htmlFor="tournamentId" className="field-label">
          Tournament
        </label>
        <select
          id="tournamentId"
          name="tournamentId"
          required
          className="field-input"
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value)}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card space-y-2 p-4 text-sm">
        <p className="font-semibold">CSV columns</p>
        <p className="text-muted">
          Required: <code>date</code> (YYYY-MM-DD), <code>home</code>, <code>away</code>. Optional:{" "}
          <code>game_id</code> (a short id like &quot;G14&quot;; set this to update the same game on a later
          re-upload instead of duplicating it),{" "}
          {season && season.divisions.length > 0 && (
            <>
              <code>gender</code> ({season.divisions.map((d) => d.name).join(" or ")}; required for this
              tournament),{" "}
            </>
          )}
          <code>home_score</code>, <code>away_score</code>, <code>time</code> (HH:MM, defaults to 09:00),{" "}
          <code>court</code>, <code>status</code> (SCHEDULED/COMPLETED/CANCELLED), <code>streaming_link</code>{" "}
          (link to watch live), and <code>order</code> (a whole number to override date-based sorting on the
          schedule/results pages - useful when same-day sessions need a specific reading order).
          {season && season.fields.length > 0 && (
            <>
              {" "}
              Custom fields for this tournament: {season.fields.map((f) => <code key={f.id}>{f.key}</code>).reduce((a, b) => (
                <>
                  {a}, {b}
                </>
              ))}
              .
            </>
          )}
        </p>
        <p className="text-muted">
          Match schools by their short code or exact name: {schoolCodes.map((s) => s.code || s.name).join(", ")}.
        </p>
        <p className="text-muted">
          A <code>home</code> or <code>away</code> cell can also be one of three placeholders instead of a school,
          for a side that isn&apos;t decided yet:
        </p>
        <ul className="list-inside list-disc text-muted">
          <li>
            <code>Winner of G1</code> / <code>Loser of G1</code> (or <code>WINNER(G1)</code>/<code>LOSER(G1)</code>)
            - fills in automatically once game G1 is scored. G1 must be a <code>game_id</code> from an earlier row
            in the file, or one already on the schedule.
          </li>
          <li>
            <code>1st</code>, <code>2nd</code>, <code>3rd</code>, ... - a placement bracket seeded by this row&apos;s
            own division&apos;s final standings, filled in automatically once every group-stage game in that
            division is decided.
          </li>
          <li>
            <code>TBD</code>, or <code>TBD(Local)</code> to show a name - an opponent that isn&apos;t in the
            database yet. This one is never filled in automatically; set it by hand later from the event&apos;s own
            page.
          </li>
        </ul>
        <p className="text-muted">
          The{" "}
          <a href={exampleHref} download className="font-semibold text-primary hover:underline">
            example CSV
          </a>{" "}
          uploads as-is: this tournament&apos;s schedule as it stands, to edit and upload again - or, before there is
          one, a sample round robin between its schools on its own dates. Games added one at a time have no{" "}
          <code>game_id</code>, so they aren&apos;t in it and stay as they are.
        </p>
      </div>

      <div>
        <label htmlFor="csvFile" className="field-label">
          Upload .csv file
        </label>
        <input id="csvFile" name="csvFile" type="file" accept=".csv,text/csv" className="field-input" />
      </div>

      <div>
        <label htmlFor="csvText" className="field-label">
          Or paste CSV text
        </label>
        <textarea
          {...csvText}
          id="csvText"
          name="csvText"
          rows={8}
          className="field-input font-mono text-xs"
          placeholder={`date,home,away,court\n2026-09-12,ASD,DAA,Main Gym`}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="replaceExisting" className="mt-0.5" />
        <span>
          Replace existing schedule. After importing this file, remove any previously-imported game (matched by{" "}
          <code>game_id</code>) that isn&apos;t in it. Use this when you&apos;ve edited a full schedule file and
          want the site to match it exactly, including removals. Requires every row to have a{" "}
          <code>game_id</code>; games without one are never removed. This permanently deletes the removed games
          and anything attached to them (results, photos, documents).
        </span>
      </label>

      {canAddSchools && <AddNewSchoolsCheckbox />}

      {state && !state.ok && <CsvImportErrors error={state.error} rowErrors={state.rowErrors} />}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Importing…" : "Import games"}
        </button>
        <a href={exampleHref} download className="text-sm font-semibold text-primary hover:underline">
          Download example CSV
        </a>
      </div>
    </form>
  );
}
