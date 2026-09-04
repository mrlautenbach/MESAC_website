"use client";

import { useActionState, useState } from "react";
import { createEventAction } from "@/lib/actions/events";

type SeasonOption = {
  id: string;
  label: string;
  divisions: { id: string; name: string }[];
};

type Props = {
  seasons: SeasonOption[];
  schools: { id: string; name: string }[];
};

export function EventForm({ seasons, schools }: Props) {
  const [state, formAction, pending] = useActionState(createEventAction, null);
  const [tournamentId, setTournamentId] = useState(seasons[0]?.id ?? "");
  const divisions = seasons.find((s) => s.id === tournamentId)?.divisions ?? [];

  if (state?.ok) {
    return <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-success">Event created!</p>;
  }

  return (
    <form action={formAction} className="max-w-lg space-y-4">
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

      {divisions.length > 0 && (
        <div>
          <label htmlFor="divisionId" className="field-label">
            Division
          </label>
          <select id="divisionId" name="divisionId" required className="field-input">
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="title" className="field-label">
          Title (optional)
        </label>
        <input id="title" name="title" placeholder="Homecoming game" className="field-input" />
      </div>

      <div>
        <label htmlFor="date" className="field-label">
          Date &amp; time
        </label>
        <input id="date" name="date" type="datetime-local" required className="field-input" />
      </div>

      <div>
        <label htmlFor="location" className="field-label">
          Location
        </label>
        <input id="location" name="location" placeholder="Central High Stadium" className="field-input" />
      </div>

      <div>
        <label htmlFor="streamUrl" className="field-label">
          Live stream link (optional)
        </label>
        <input
          id="streamUrl"
          name="streamUrl"
          type="url"
          placeholder="https://youtube.com/watch?v=..."
          className="field-input"
        />
      </div>

      <div>
        <p className="field-label">Participating schools</p>
        <div className="space-y-2">
          {schools.map((school) => (
            <label key={school.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="schoolIds" value={school.id} />
              {school.name}
            </label>
          ))}
        </div>
      </div>

      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
