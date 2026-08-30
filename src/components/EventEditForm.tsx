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

type Props = {
  eventId: string;
  isAdmin: boolean;
  viewerSchoolId: string | null;
  dateValue: string; // yyyy-MM-ddTHH:mm for the datetime-local input
  location: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  recap: string;
  scoringType: ScoringType;
  participants: ParticipantResult[];
  individualResultsBySchool: Record<string, IndividualEntry[]>;
};

export function EventEditForm({
  eventId,
  isAdmin,
  viewerSchoolId,
  dateValue,
  location,
  status,
  recap,
  scoringType,
  participants,
  individualResultsBySchool,
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
      </div>

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
                          {scoringType === "LOW_SCORE" ? "Team score" : "Score"}
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
        </div>
      )}

      {scoringType === "NONE" && (
        <p className="text-sm text-muted">
          This activity doesn&apos;t use a standings table — post results as a document below, and use the recap for
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
