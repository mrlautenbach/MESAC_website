"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { saveMeetProgramAction } from "@/lib/actions/meet-schedule";
import { CsvImportErrors } from "@/components/CsvImportOutcome";

// One round of one event in the meet's program, its cells keyed by the meet
// schedule CSV's column names - the same rows the CSV import reads.
export type MeetEditorRow = Record<
  | "date"
  | "session"
  | "event_number"
  | "round"
  | "event_name"
  | "gender"
  | "division"
  | "location"
  | "status"
  | "live_stream"
  | "time",
  string
>;

type Props = {
  tournamentId: string;
  // Changes whenever the saved program does, so the grid starts over from it.
  version: string;
  rows: MeetEditorRow[];
  divisions: string[];
  // The meet's sessions in order, with the day each is on.
  sessions: { name: string; date: string }[];
  defaultDate: string;
};

type Column = {
  key: keyof MeetEditorRow;
  label: string;
  kind: "text" | "session" | "number" | "date" | "time" | "round" | "gender" | "division" | "status";
  width: string;
};

type Row = { key: string; values: MeetEditorRow; original: MeetEditorRow | null; deleted: boolean };

const STATUSES = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

let nextKey = 0;
const newKey = () => `row-${++nextKey}`;
const sameSession = (a: Row, b: Row) => a.values.session.trim().toLowerCase() === b.values.session.trim().toLowerCase();
const numberOf = (row: Row) => Number(row.values.event_number);

export function MeetProgramEditor(props: Props) {
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {saved && (
        <p role="status" className="bg-success-tint px-4 py-3 text-sm text-success">
          {saved}
        </p>
      )}
      <EditorGrid key={props.version} {...props} onSaved={setSaved} />
    </div>
  );
}

function EditorGrid({
  tournamentId,
  rows: initialRows,
  divisions,
  sessions,
  defaultDate,
  onSaved,
}: Props & { onSaved: (message: string | null) => void }) {
  const columns = useMemo<Column[]>(
    () => [
      { key: "session", label: "Session", kind: "session", width: "10rem" },
      { key: "date", label: "Date", kind: "date", width: "9.5rem" },
      { key: "time", label: "Time", kind: "time", width: "7rem" },
      { key: "event_number", label: "#", kind: "number", width: "3.5rem" },
      { key: "event_name", label: "Event", kind: "text", width: "12rem" },
      { key: "round", label: "Round", kind: "round", width: "6.5rem" },
      { key: "gender", label: "Gender", kind: "gender", width: "6rem" },
      ...(divisions.length > 0 ? [{ key: "division", label: "Division", kind: "division", width: "9rem" } as Column] : []),
      { key: "location", label: "Location", kind: "text", width: "9rem" },
      { key: "status", label: "Status", kind: "status", width: "8rem" },
      { key: "live_stream", label: "Live stream", kind: "text", width: "11rem" },
    ],
    [divisions.length]
  );

  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((values) => ({ key: newKey(), values, original: values, deleted: false }))
  );
  const [errors, setErrors] = useState<{ message: string; byRow: Map<string, string[]> } | null>(null);
  const [pending, startTransition] = useTransition();

  const kept = rows.filter((r) => !r.deleted);
  const dirty = JSON.stringify(kept.map((r) => r.values)) !== JSON.stringify(initialRows);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Session by session (in the meet's own order, then any new ones), then
  // the running order within each - how the public schedule lists them.
  const sorted = (list: Row[]) => {
    const sessionRank = (row: Row) => {
      const i = sessions.findIndex((s) => s.name.toLowerCase() === row.values.session.trim().toLowerCase());
      return i < 0 ? sessions.length : i;
    };
    return [...list].sort(
      (a, b) =>
        sessionRank(a) - sessionRank(b) ||
        a.values.session.localeCompare(b.values.session) ||
        numberOf(a) - numberOf(b) ||
        (a.values.round === b.values.round ? 0 : a.values.round === "prelim" ? -1 : 1)
    );
  };

  const setCell = (rowKey: string, key: keyof MeetEditorRow, value: string) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== rowKey) return r;
        const values = { ...r.values, [key]: value };
        // Picking an existing session puts the round on that session's day.
        const session = key === "session" ? sessions.find((s) => s.name.toLowerCase() === value.trim().toLowerCase()) : undefined;
        if (session) values.date = session.date;
        return { ...r, values };
      })
    );

  // The nearest kept row in that direction, if it's in the same session.
  const neighbour = (index: number, dir: -1 | 1) => {
    for (let j = index + dir; j >= 0 && j < rows.length; j += dir) {
      if (rows[j].deleted) continue;
      return sameSession(rows[j], rows[index]) && numberOf(rows[j]) !== numberOf(rows[index]) ? j : -1;
    }
    return -1;
  };

  // Moving an event trades places with the one next to it: the two swap
  // event numbers everywhere (so a prelim and its final stay paired), and
  // their rounds in the same session swap times, keeping the running order
  // and the clock in step.
  const move = (index: number, dir: -1 | 1) => {
    const j = neighbour(index, dir);
    if (j < 0) return;
    const a = rows[index].values.event_number;
    const b = rows[j].values.event_number;
    setRows((rs) => {
      const next = rs.map((r) => ({ ...r, values: { ...r.values } }));
      const live = next.filter((r) => !r.deleted);
      // Rounds of the two events sharing a session (and round, when a
      // session holds both rounds of one event) trade times.
      for (const ra of live.filter((r) => r.values.event_number === a)) {
        const partners = live.filter((r) => r.values.event_number === b && sameSession(r, ra));
        const rb = partners.length === 1 ? partners[0] : partners.find((r) => r.values.round === ra.values.round);
        if (!rb) continue;
        [ra.values.date, rb.values.date] = [rb.values.date, ra.values.date];
        [ra.values.time, rb.values.time] = [rb.values.time, ra.values.time];
      }
      for (const r of live) {
        if (r.values.event_number === a) r.values.event_number = b;
        else if (r.values.event_number === b) r.values.event_number = a;
      }
      return sorted(next);
    });
  };

  // A new event straight after this one: the next number, with every later
  // event moved up one to make room if it's taken.
  const insertBelow = (index: number) =>
    setRows((rs) => {
      const from = rs[index];
      const n = Number.isInteger(numberOf(from)) ? numberOf(from) + 1 : 1;
      const taken = rs.some((r) => !r.deleted && numberOf(r) === n);
      const shifted = rs.map((r) =>
        taken && !r.deleted && numberOf(r) >= n ? { ...r, values: { ...r.values, event_number: String(numberOf(r) + 1) } } : r
      );
      const row: Row = {
        key: newKey(),
        values: { ...from.values, event_number: String(n), event_name: "", status: "SCHEDULED", live_stream: "" },
        original: null,
        deleted: false,
      };
      return [...shifted.slice(0, index + 1), row, ...shifted.slice(index + 1)];
    });

  const addAtEnd = () =>
    setRows((rs) => {
      const live = rs.filter((r) => !r.deleted);
      const last = live[live.length - 1];
      const highest = Math.max(0, ...live.map(numberOf).filter(Number.isInteger));
      const values: MeetEditorRow = last
        ? { ...last.values, event_number: String(highest + 1), event_name: "", status: "SCHEDULED", live_stream: "" }
        : {
            date: sessions[0]?.date ?? defaultDate,
            session: sessions[0]?.name ?? "Day 1 Finals",
            event_number: "1",
            round: "final",
            event_name: "",
            gender: "",
            division: divisions[0] ?? "",
            location: "",
            status: "SCHEDULED",
            live_stream: "",
            time: "09:00",
          };
      return [...rs, { key: newKey(), values, original: null, deleted: false }];
    });

  // Closes the gaps deletions leave: event numbers 1, 2, 3... in their
  // current order, a prelim and its final keeping one number between them.
  const renumber = () =>
    setRows((rs) => {
      const numbers = Array.from(new Set(rs.filter((r) => !r.deleted).map(numberOf).filter(Number.isInteger))).sort((x, y) => x - y);
      const to = new Map(numbers.map((n, i) => [n, String(i + 1)]));
      return rs.map((r) => (r.deleted || !to.has(numberOf(r)) ? r : { ...r, values: { ...r.values, event_number: to.get(numberOf(r))! } }));
    });

  const remove = (row: Row) =>
    setRows((rs) =>
      row.original ? rs.map((r) => (r.key === row.key ? { ...r, deleted: !r.deleted } : r)) : rs.filter((r) => r.key !== row.key)
    );

  const discard = () => {
    setRows(initialRows.map((values) => ({ key: newKey(), values, original: values, deleted: false })));
    setErrors(null);
  };

  const save = () => {
    const payload = {
      tournamentId,
      rows: rows.flatMap((r, i) => (r.deleted ? [] : [{ rowNum: i + 1, values: r.values }])),
    };
    onSaved(null);
    startTransition(async () => {
      const result = await saveMeetProgramAction(payload);
      if (result.ok) {
        setErrors(null);
        onSaved(
          `Saved - ${result.rounds} round${result.rounds === 1 ? "" : "s"} across ${result.sessions} session${
            result.sessions === 1 ? "" : "s"
          }${result.newSessions > 0 ? ` (${result.newSessions} new)` : ""}.`
        );
        return;
      }
      const byRow = new Map<string, string[]>();
      for (const e of result.rowErrors ?? []) {
        const row = rows[e.row - 1];
        if (row) byRow.set(row.key, [...(byRow.get(row.key) ?? []), e.message]);
      }
      setErrors({ message: result.error, byRow });
    });
  };

  const inputClass =
    "w-full min-w-0 border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-control-border focus:border-primary focus:outline-none disabled:hover:border-transparent";

  const renderCell = (row: Row, col: Column) => {
    const value = row.values[col.key];
    const changed = !row.deleted && (!row.original || value !== row.original[col.key]);
    const common = {
      "aria-label": col.label === "#" ? "Event number" : col.label,
      disabled: row.deleted || pending,
      className: `${inputClass} ${changed ? "bg-primary-tint" : ""}`,
    };
    const onChange = (e: { target: { value: string } }) => setCell(row.key, col.key, e.target.value);
    const select = (options: { value: string; label: string }[]) => (
      <select {...common} value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
    switch (col.kind) {
      case "status":
        return select(STATUSES);
      case "round":
        return select([
          { value: "final", label: "Final" },
          { value: "prelim", label: "Prelim" },
        ]);
      case "gender":
        return select([
          { value: "", label: "—" },
          { value: "Girls", label: "Girls" },
          { value: "Boys", label: "Boys" },
        ]);
      case "division":
        return select([{ value: "", label: "—" }, ...divisions.map((d) => ({ value: d, label: d }))]);
      case "session":
        return <input {...common} value={value} onChange={onChange} list="meet-session-options" />;
      case "number":
        return <input {...common} value={value} onChange={onChange} inputMode="numeric" className={`${common.className} tabular-nums`} />;
      case "date":
        return <input {...common} type="date" value={value} onChange={onChange} />;
      case "time":
        return <input {...common} type="time" value={value} onChange={onChange} />;
      default:
        return <input {...common} value={value} onChange={onChange} />;
    }
  };

  const iconButton =
    "inline-flex h-7 w-7 items-center justify-center text-sm text-muted hover:bg-primary-tint hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="space-y-4">
      {errors && (
        <CsvImportErrors
          error={errors.message}
          rowErrors={rows.flatMap((r, i) => (errors.byRow.get(r.key) ?? []).map((message) => ({ row: i + 1, message })))}
        />
      )}

      <datalist id="meet-session-options">
        {sessions.map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>

      <div className="card relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-divider text-left text-[0.6875rem] uppercase tracking-wider text-muted">
              <th className="px-2 py-2 font-bold">Row</th>
              {columns.map((c) => (
                <th key={c.key} className="px-1.5 py-2 font-bold" style={{ minWidth: c.width }}>
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-muted">
                  No events in the program yet - add the first one below, or upload a CSV.
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const rowErrors = errors?.byRow.get(row.key);
              // A divider where one session ends and the next begins.
              const newSession = i > 0 && !sameSession(rows[i - 1], row);
              return (
                <Fragment key={row.key}>
                  <tr
                    className={`${newSession ? "border-t-2 border-divider" : ""} border-b border-border ${
                      row.deleted ? "opacity-50 [&_input]:line-through" : ""
                    } ${rowErrors ? "bg-danger-tint" : ""} ${!row.original ? "shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
                  >
                    <td className="px-2 py-1 tabular-nums text-muted">{i + 1}</td>
                    {columns.map((c) => (
                      <td key={c.key} className="px-0.5 py-0.5">
                        {renderCell(row, c)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-1 py-0.5">
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => move(i, -1)}
                        disabled={pending || row.deleted || neighbour(i, -1) < 0}
                        aria-label={`Move row ${i + 1} up`}
                        title="Swap places with the event above"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => move(i, 1)}
                        disabled={pending || row.deleted || neighbour(i, 1) < 0}
                        aria-label={`Move row ${i + 1} down`}
                        title="Swap places with the event below"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => insertBelow(i)}
                        disabled={pending || row.deleted}
                        aria-label={`Add an event after row ${i + 1}`}
                        title="Add an event after this one"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`${iconButton} ${row.deleted ? "w-auto px-1.5 text-xs font-semibold text-primary" : "hover:text-danger"}`}
                        onClick={() => remove(row)}
                        disabled={pending}
                        aria-label={row.deleted ? `Keep row ${i + 1}` : `Delete row ${i + 1}`}
                        title={row.deleted ? "Keep this round" : "Delete this round"}
                      >
                        {row.deleted ? "Undo" : "✕"}
                      </button>
                    </td>
                  </tr>
                  {rowErrors && (
                    <tr className="bg-danger-tint">
                      <td />
                      <td colSpan={columns.length + 1} className="px-1.5 pb-2 text-xs text-danger">
                        {rowErrors.join(" ")}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={addAtEnd} disabled={pending} className="btn btn-secondary">
          + Add an event
        </button>
        <button
          type="button"
          onClick={renumber}
          disabled={pending || kept.length === 0}
          className="btn btn-secondary"
          title="Number the events 1, 2, 3... in their current order"
        >
          Renumber events
        </button>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-divider bg-background px-4 py-3 sm:mx-0">
        <span className="mr-auto text-sm text-muted">{dirty ? "Unsaved changes" : "No unsaved changes"}</span>
        <button type="button" onClick={discard} disabled={pending || !dirty} className="btn btn-secondary">
          Discard changes
        </button>
        <button type="button" onClick={save} disabled={pending || !dirty} className="btn btn-primary">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
