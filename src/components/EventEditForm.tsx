"use client";

import { useActionState, useId, useState } from "react";
import { updateEventAction } from "@/lib/actions/events";

type ScoringType = "WIN_LOSS" | "LOW_SCORE" | "NONE";

type ParticipantResult = {
  schoolId: string;
  schoolName: string;
  score: number | null;
  outcome: "WIN" | "LOSS" | "DRAW" | null;
};

type IndividualEntry = { athleteName: string; score: number };

type SetEntry = { setNumber: number; homeScore: number; awayScore: number };

type SideAssignment = {
  schoolId: string | null;
  // What this side is currently waiting on if no school is assigned yet
  // (e.g. "Winner of G3", from a CSV playoff reference) - display only.
  pendingLabel: string | null;
};

type Props = {
  eventId: string;
  isAdmin: boolean;
  viewerSchoolId: string | null;
  dateValue: string; // yyyy-MM-ddTHH:mm for the datetime-local input
  location: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  recap: string;
  streamUrl: string;
  scoringType: ScoringType;
  usesSetScores: boolean;
  participants: ParticipantResult[];
  homeSchoolId: string | null;
  individualResultsBySchool: Record<string, IndividualEntry[]>;
  initialSets: SetEntry[];
  schools: { id: string; name: string }[];
  canEditMatchup: boolean;
  homeSide: SideAssignment;
  awaySide: SideAssignment;
};

export function EventEditForm({
  eventId,
  isAdmin,
  viewerSchoolId,
  dateValue,
  location,
  status,
  recap,
  streamUrl,
  scoringType,
  usesSetScores,
  participants,
  homeSchoolId,
  individualResultsBySchool,
  initialSets,
  schools,
  canEditMatchup,
  homeSide,
  awaySide,
}: Props) {
  const [state, formAction, pending] = useActionState(updateEventAction, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className="field-label">
            Date &amp; time
          </label>
          <input
            id="date"
            name="date"
            type="datetime-local"
            defaultValue={dateValue}
            required
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="location" className="field-label">
            Location
          </label>
          <input id="location" name="location" type="text" defaultValue={location} className="field-input" />
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="field-input">
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="streamUrl" className="field-label">
            Live stream link
          </label>
          <input
            id="streamUrl"
            name="streamUrl"
            type="url"
            defaultValue={streamUrl}
            placeholder="https://youtube.com/watch?v=..."
            className="field-input"
          />
        </div>
      </div>

      {canEditMatchup && <MatchupEditor schools={schools} homeSide={homeSide} awaySide={awaySide} />}

      {scoringType !== "NONE" && (
        <div>
          <h3 className="field-label mb-2">Result</h3>
          <div className="space-y-3">
            {participants.map((p) => {
              const editable = isAdmin || p.schoolId === viewerSchoolId;
              return (
                <div key={p.schoolId} className="card p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-40 font-medium">{p.schoolName}</span>
                    {editable ? (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          {scoringType === "LOW_SCORE" ? "Team score" : usesSetScores ? "Sets won" : "Score"}
                          <input
                            type="number"
                            min={0}
                            max={9999}
                            name={`result-${p.schoolId}-score`}
                            defaultValue={p.score ?? ""}
                            className="field-input w-24"
                          />
                        </label>
                        {scoringType === "WIN_LOSS" && (
                          <label className="flex items-center gap-2 text-sm">
                            Outcome
                            <select
                              name={`result-${p.schoolId}-outcome`}
                              defaultValue={p.outcome ?? ""}
                              className="field-input w-32"
                            >
                              <option value="">Not set</option>
                              <option value="WIN">Win</option>
                              <option value="LOSS">Loss</option>
                              <option value="DRAW">Draw</option>
                            </select>
                          </label>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted">
                        {p.outcome ? `${p.outcome} · ` : ""}
                        {p.score ?? "No score entered"}
                        <span className="ml-1 italic">(entered by {p.schoolName})</span>
                      </span>
                    )}
                  </div>

                  {scoringType === "LOW_SCORE" && editable && (
                    <IndividualScoresEditor
                      schoolId={p.schoolId}
                      initialEntries={individualResultsBySchool[p.schoolId] ?? []}
                    />
                  )}
                  {scoringType === "LOW_SCORE" && !editable && individualResultsBySchool[p.schoolId]?.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-2 text-sm text-muted">
                      {individualResultsBySchool[p.schoolId].map((entry, i) => (
                        <li key={i}>
                          {entry.athleteName} — {entry.score}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {scoringType === "WIN_LOSS" && usesSetScores && participants.length === 2 && (
            <SetScoresEditor
              homeSchoolName={participants.find((p) => p.schoolId === homeSchoolId)?.schoolName ?? participants[0].schoolName}
              awaySchoolName={participants.find((p) => p.schoolId !== homeSchoolId)?.schoolName ?? participants[1].schoolName}
              editable={isAdmin || participants.some((p) => p.schoolId === viewerSchoolId)}
              initialSets={initialSets}
            />
          )}
        </div>
      )}

      {scoringType === "NONE" && (
        <p className="text-sm text-muted">
          This activity doesn&apos;t use a results table — post results as a document below, and use the recap for
          a summary.
        </p>
      )}

      <div>
        <label htmlFor="recap" className="field-label">
          Recap
        </label>
        <textarea
          id="recap"
          name="recap"
          rows={4}
          defaultValue={recap}
          placeholder="A sentence or two about the game…"
          className="field-input"
        />
      </div>

      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">
          Saved!
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function MatchupEditor({
  schools,
  homeSide,
  awaySide,
}: {
  schools: { id: string; name: string }[];
  homeSide: SideAssignment;
  awaySide: SideAssignment;
}) {
  return (
    <div>
      <h3 className="field-label mb-2">Matchup</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <SideSelect label="Home" name="home-schoolId" schools={schools} side={homeSide} />
        <SideSelect label="Away" name="away-schoolId" schools={schools} side={awaySide} />
      </div>
      <p className="mt-1 text-xs text-muted">
        Change who&apos;s playing on either side — this overrides any pending bracket reference (e.g. &quot;Winner
        of G3&quot;) for that side. Leave a side as &quot;Not decided yet&quot; to keep it waiting on the referenced
        game.
      </p>
    </div>
  );
}

function SideSelect({
  label,
  name,
  schools,
  side,
}: {
  label: string;
  name: string;
  schools: { id: string; name: string }[];
  side: SideAssignment;
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <select id={name} name={name} defaultValue={side.schoolId ?? ""} className="field-input">
        <option value="">{side.pendingLabel ? `Not decided yet — ${side.pendingLabel}` : "Not decided yet"}</option>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function SetScoresEditor({
  homeSchoolName,
  awaySchoolName,
  editable,
  initialSets,
}: {
  homeSchoolName: string;
  awaySchoolName: string;
  editable: boolean;
  initialSets: SetEntry[];
}) {
  const idPrefix = useId();
  const [rows, setRows] = useState(
    initialSets.length > 0
      ? initialSets.map((s, i) => ({ key: `${idPrefix}-${i}`, homeScore: s.homeScore, awayScore: s.awayScore }))
      : [{ key: `${idPrefix}-0`, homeScore: 0, awayScore: 0 }]
  );

  function addRow() {
    setRows((r) => [...r, { key: `${idPrefix}-${r.length}-${Date.now()}`, homeScore: 0, awayScore: 0 }]);
  }
  function removeRow(key: string) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  if (!editable) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold text-muted">Set scores</p>
        {initialSets.length === 0 ? (
          <p className="text-sm text-muted">No set scores entered.</p>
        ) : (
          <ul className="flex flex-wrap gap-3 text-sm text-muted">
            {initialSets.map((s) => (
              <li key={s.setNumber}>
                Set {s.setNumber}: {s.homeScore}–{s.awayScore}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <input type="hidden" name="sets-present" value="1" />
      <p className="mb-2 text-xs font-semibold text-muted">
        Set scores ({homeSchoolName} – {awaySchoolName})
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted">Set {i + 1}</span>
            <input
              type="number"
              name="set-home-score"
              defaultValue={row.homeScore}
              min={0}
              max={999}
              className="field-input w-16 text-sm"
            />
            <span className="text-muted">–</span>
            <input
              type="number"
              name="set-away-score"
              defaultValue={row.awayScore}
              min={0}
              max={999}
              className="field-input w-16 text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label="Remove set"
              className="btn btn-secondary px-2 py-1 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="btn btn-secondary mt-2 px-3 py-1 text-xs">
        + Add set
      </button>
      <p className="mt-1 text-xs text-muted">
        One row per set played — a match can end in as few as 2 sets or run the full 5.
      </p>
    </div>
  );
}

function IndividualScoresEditor({
  schoolId,
  initialEntries,
}: {
  schoolId: string;
  initialEntries: IndividualEntry[];
}) {
  const idPrefix = useId();
  const [rows, setRows] = useState(
    initialEntries.length > 0
      ? initialEntries.map((e, i) => ({ key: `${idPrefix}-${i}`, ...e }))
      : [{ key: `${idPrefix}-0`, athleteName: "", score: 0 }]
  );

  function addRow() {
    setRows((r) => [...r, { key: `${idPrefix}-${r.length}-${Date.now()}`, athleteName: "", score: 0 }]);
  }
  function removeRow(key: string) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <input type="hidden" name={`individual-${schoolId}-present`} value="1" />
      <p className="mb-2 text-xs font-semibold text-muted">Individual scores</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <input
              type="text"
              name={`individual-${schoolId}-name`}
              defaultValue={row.athleteName}
              placeholder="Athlete name"
              maxLength={120}
              className="field-input flex-1 text-sm"
            />
            <input
              type="number"
              name={`individual-${schoolId}-score`}
              defaultValue={row.athleteName ? row.score : ""}
              min={0}
              max={999}
              placeholder="Score"
              className="field-input w-24 text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label="Remove"
              className="btn btn-secondary px-2 py-1 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="btn btn-secondary mt-2 px-3 py-1 text-xs">
        + Add athlete
      </button>
    </div>
  );
}
