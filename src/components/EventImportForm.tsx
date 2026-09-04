"use client";

import { useActionState, useMemo, useState } from "react";
import { importEventsAction, type ImportEventsResult } from "@/lib/actions/events";

type SeasonOption = {
  id: string;
  label: string;
  divisions: { id: string; name: string }[];
  fields: { id: string; key: string; label: string }[];
};

type Props = {
  seasons: SeasonOption[];
  schoolCodes: { code: string; name: string }[];
};

function buildTemplate(season: SeasonOption | undefined, schoolCodes: Props["schoolCodes"]) {
  const genderCol = (season?.divisions.length ?? 0) > 0 ? ["gender"] : [];
  const customCols = season?.fields.map((f) => f.key) ?? [];
  const header = ["game_id", ...genderCol, "home", "home_score", "away", "away_score", "date", "time", "court", "streaming_link", "status", ...customCols];
  const sampleCodes = schoolCodes.slice(0, 2).map((s) => s.code || s.name);
  const genderSample = (season?.divisions.length ?? 0) > 0 ? [season!.divisions[0].name] : [];
  const customSample = customCols.map(() => "");
  const row1 = ["G1", ...genderSample, sampleCodes[0] ?? "TEAM1", "", sampleCodes[1] ?? "TEAM2", "", "2026-09-12", "09:00", "Main Gym", "", "SCHEDULED", ...customSample];
  const row2 = ["G2", ...genderSample, sampleCodes[1] ?? "TEAM2", "", "WINNER(G1)", "", "2026-09-13", "09:00", "Main Gym", "", "SCHEDULED", ...customSample];
  return `${header.join(",")}\n${row1.join(",")}\n${row2.join(",")}\n`;
}

export function EventImportForm({ seasons, schoolCodes }: Props) {
  const [state, formAction, pending] = useActionState<ImportEventsResult | null, FormData>(importEventsAction, null);
  const [tournamentId, setTournamentId] = useState(seasons[0]?.id ?? "");
  const season = seasons.find((s) => s.id === tournamentId);

  const templateHref = useMemo(() => {
    const csv = buildTemplate(season, schoolCodes);
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  }, [season, schoolCodes]);

  if (state?.ok) {
    return (
      <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-success">
        Imported {state.created} new game{state.created === 1 ? "" : "s"}
        {state.updated > 0 && `, updated ${state.updated} existing game${state.updated === 1 ? "" : "s"}`}
        {state.removed > 0 && `, and removed ${state.removed} game${state.removed === 1 ? "" : "s"} no longer in the file`}. Refresh
        the schedule to see them, or{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          import another file
        </button>
        .
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
          <code>game_id</code> (a short id like &quot;G14&quot; — set this to update the same game on a later
          re-upload instead of duplicating it),{" "}
          {season && season.divisions.length > 0 && (
            <>
              <code>gender</code> ({season.divisions.map((d) => d.name).join(" or ")} — required for this
              tournament),{" "}
            </>
          )}
          <code>home_score</code>, <code>away_score</code>, <code>time</code> (HH:MM, defaults to 09:00),{" "}
          <code>court</code>, <code>status</code> (SCHEDULED/COMPLETED/CANCELLED), and <code>streaming_link</code>{" "}
          (link to watch live).
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
          Match schools by their short code or exact name:{" "}
          {schoolCodes.map((s) => s.code || s.name).join(", ")}.
        </p>
        <p className="text-muted">
          For a playoff round, set <code>home</code> or <code>away</code> to <code>WINNER(G1)</code> or{" "}
          <code>LOSER(G1)</code> instead of a school — once game G1 is scored, that slot fills in automatically. A
          game can only reference a <code>game_id</code> from an earlier row in the file, or one already on the
          schedule.
        </p>
        <a href={templateHref} download={`${season?.label.replace(/[^a-z0-9]+/gi, "-") || "events"}-template.csv`} className="btn btn-secondary">
          Download CSV template
        </a>
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
          Replace existing schedule — after importing this file, remove any previously-imported game (matched by{" "}
          <code>game_id</code>) that isn&apos;t in it. Use this when you&apos;ve edited a full schedule file and want
          the site to match it exactly, including removals. Requires every row to have a <code>game_id</code>;
          games without one are never removed. This permanently deletes the removed games and anything attached to
          them (results, photos, documents).
        </span>
      </label>

      {state && !state.ok && (
        <div role="alert" className="space-y-2 rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
          <p className="font-semibold">{state.error}</p>
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="list-inside list-disc space-y-1">
              {state.rowErrors.map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Importing…" : "Import games"}
      </button>
    </form>
  );
}
