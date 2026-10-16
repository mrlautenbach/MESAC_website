"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { saveGameScheduleAction } from "@/lib/actions/events";
import { CsvImportErrors } from "@/components/CsvImportOutcome";

// One game as the editor shows it, its cells keyed by the schedule CSV's
// column names - the same rows the CSV import reads, so a cell here means
// exactly what it would in an uploaded file.
export type GameEditorRow = {
  eventId: string;
  values: Record<string, string>;
  // A game between more than two schools has no home and away to edit here;
  // it's shown for its place in the list, and edited from its own page.
  locked: string | null;
  // What deleting the game takes with it ("a result", "3 photos").
  attached: string[];
};

type Props = {
  tournamentId: string;
  // Changes whenever the saved schedule does, so the grid starts over from it.
  version: string;
  rows: GameEditorRow[];
  divisions: string[];
  scored: boolean;
  fields: { key: string; label: string }[];
  showOrder: boolean;
  showTitle: boolean;
  // School codes (or names), for the home/away suggestions.
  schools: string[];
  // Where a game added below an empty schedule starts.
  defaultDate: string;
};

type Column = {
  key: string;
  label: string;
  kind: "text" | "side" | "score" | "date" | "time" | "status" | "division" | "number";
  width: string;
};

type Row = {
  key: string;
  eventId: string | null;
  values: Record<string, string>;
  // As last saved; null for a row added here.
  original: Record<string, string> | null;
  deleted: boolean;
  locked: string | null;
  attached: string[];
};

const STATUSES = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

// A game's slot: what it trades with the game next to it when moved.
const SLOT_KEYS = ["date", "time", "court", "order"];

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

export function GameScheduleEditor(props: Props) {
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
  scored,
  fields,
  showOrder,
  showTitle,
  schools,
  defaultDate,
  onSaved,
}: Props & { onSaved: (message: string | null) => void }) {
  const columns = useMemo<Column[]>(
    () => [
      { key: "game_id", label: "Game", kind: "text", width: "5rem" },
      ...(divisions.length > 0 ? [{ key: "gender", label: "Division", kind: "division", width: "8rem" } as Column] : []),
      { key: "home", label: "Home", kind: "side", width: "9rem" },
      ...(scored ? [{ key: "home_score", label: "Score", kind: "score", width: "4rem" } as Column] : []),
      { key: "away", label: "Away", kind: "side", width: "9rem" },
      ...(scored ? [{ key: "away_score", label: "Score", kind: "score", width: "4rem" } as Column] : []),
      { key: "date", label: "Date", kind: "date", width: "9.5rem" },
      { key: "time", label: "Time", kind: "time", width: "7rem" },
      { key: "court", label: "Court", kind: "text", width: "8rem" },
      { key: "status", label: "Status", kind: "status", width: "8rem" },
      { key: "streaming_link", label: "Stream link", kind: "text", width: "11rem" },
      ...fields.map((f) => ({ key: f.key, label: f.label, kind: "text", width: "8rem" }) as Column),
      ...(showOrder ? [{ key: "order", label: "Order", kind: "number", width: "4.5rem" } as Column] : []),
      ...(showTitle ? [{ key: "title", label: "Title", kind: "text", width: "10rem" } as Column] : []),
    ],
    [divisions.length, scored, fields, showOrder, showTitle]
  );
  const keys = useMemo(() => columns.map((c) => c.key), [columns]);

  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r) => ({
      key: r.eventId,
      eventId: r.eventId,
      values: r.values,
      original: r.values,
      deleted: false,
      locked: r.locked,
      attached: r.attached,
    }))
  );
  const [errors, setErrors] = useState<{ message: string; byRow: Map<string, string[]> } | null>(null);
  const [pending, startTransition] = useTransition();

  const changedKeys = (row: Row) => (row.original ? keys.filter((k) => (row.values[k] ?? "") !== (row.original![k] ?? "")) : keys);
  const isDirty = (row: Row) => !row.locked && !row.deleted && (!row.original || changedKeys(row).length > 0);
  const changeCount = rows.filter((r) => isDirty(r) || (r.deleted && r.eventId)).length;

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (changeCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changeCount]);

  const setCell = (rowKey: string, key: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === rowKey ? { ...r, values: { ...r.values, [key]: value } } : r)));

  // The nearest row in that direction still on the schedule.
  const neighbour = (index: number, dir: -1 | 1) => {
    for (let j = index + dir; j >= 0 && j < rows.length; j += dir) if (!rows[j].deleted) return j;
    return -1;
  };

  // Moving a game trades its slot (date, time, court and any manual order)
  // with the game next to it, so the two swap places on the schedule.
  const move = (index: number, dir: -1 | 1) => {
    const j = neighbour(index, dir);
    if (j < 0 || rows[j].locked || rows[index].locked) return;
    setRows((rs) => {
      const next = [...rs];
      const a = next[index];
      const b = next[j];
      const aSlot = Object.fromEntries(SLOT_KEYS.map((k) => [k, a.values[k] ?? ""]));
      const bSlot = Object.fromEntries(SLOT_KEYS.map((k) => [k, b.values[k] ?? ""]));
      next[index] = { ...b, values: { ...b.values, ...aSlot } };
      next[j] = { ...a, values: { ...a.values, ...bSlot } };
      return next;
    });
  };

  // The next free id after this row's ("G7" -> "G8", or past the highest
  // in use), so a new game can be named in winner/loser slots straight away.
  const nextGameId = (from: Row | undefined) => {
    const prefix = from?.values.game_id?.match(/^(.*?)\d+$/)?.[1] ?? "G";
    const taken = new Set(rows.map((r) => r.values.game_id).filter(Boolean));
    const highest = Math.max(
      0,
      ...rows.map((r) => r.values.game_id?.match(/^(.*?)(\d+)$/)).flatMap((m) => (m && m[1] === prefix ? [Number(m[2])] : []))
    );
    let n = highest + 1;
    while (taken.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };

  const blankFrom = (from: Row | undefined): Row => {
    const values: Record<string, string> = Object.fromEntries(keys.map((k) => [k, ""]));
    values.game_id = nextGameId(from);
    values.status = "SCHEDULED";
    for (const k of ["gender", "date", "time", "court"]) values[k] = from?.values[k] ?? "";
    if (!values.date) values.date = defaultDate;
    if (!values.time) values.time = "09:00";
    return { key: newKey(), eventId: null, values, original: null, deleted: false, locked: null, attached: [] };
  };

  const insertBelow = (index: number) =>
    setRows((rs) => [...rs.slice(0, index + 1), blankFrom(rs[index]), ...rs.slice(index + 1)]);
  const addAtEnd = () => setRows((rs) => [...rs, blankFrom([...rs].reverse().find((r) => !r.deleted && !r.locked))]);

  const remove = (row: Row) => {
    if (!row.eventId) return setRows((rs) => rs.filter((r) => r.key !== row.key));
    if (!row.deleted && row.attached.length > 0) {
      const ok = window.confirm(
        `Deleting this game also deletes its ${row.attached.join(", ")} when you save. Delete it?`
      );
      if (!ok) return;
    }
    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, deleted: !r.deleted } : r)));
  };

  const discard = () => {
    setRows((rs) =>
      rs.flatMap((r) => (r.original ? [{ ...r, values: r.original, deleted: false }] : []))
        // Put moved games back where they were.
        .sort((a, b) => initialRows.findIndex((x) => x.eventId === a.eventId) - initialRows.findIndex((x) => x.eventId === b.eventId))
    );
    setErrors(null);
  };

  const save = () => {
    const payload = {
      tournamentId,
      rows: rows.flatMap((r, i) =>
        isDirty(r) ? [{ rowNum: i + 1, eventId: r.eventId, values: r.values, changed: changedKeys(r) }] : []
      ),
      deleteEventIds: rows.flatMap((r) => (r.deleted && r.eventId ? [r.eventId] : [])),
    };
    onSaved(null);
    startTransition(async () => {
      const result = await saveGameScheduleAction(payload);
      if (result.ok) {
        setErrors(null);
        const parts = [
          result.created > 0 && `${result.created} added`,
          result.updated > 0 && `${result.updated} updated`,
          result.removed > 0 && `${result.removed} deleted`,
        ].filter(Boolean);
        onSaved(`Saved - ${parts.join(", ") || "no changes"}.`);
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

  // Every game id on the page, for "Winner of ..." suggestions.
  const sideOptions = useMemo(() => {
    const ids = rows.filter((r) => !r.deleted && r.values.game_id).map((r) => r.values.game_id);
    return [...schools, "TBD", "1st", "2nd", "3rd", "4th", ...ids.flatMap((id) => [`Winner of ${id}`, `Loser of ${id}`])];
  }, [rows, schools]);

  const inputClass =
    "w-full min-w-0 border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-control-border focus:border-primary focus:outline-none disabled:hover:border-transparent";

  const renderCell = (row: Row, col: Column) => {
    const value = row.values[col.key] ?? "";
    const changed = !row.deleted && (!row.original || value !== (row.original[col.key] ?? ""));
    const common = {
      "aria-label": col.label,
      disabled: row.deleted || pending,
      className: `${inputClass} ${changed ? "bg-primary-tint" : ""}`,
    };
    const onChange = (e: { target: { value: string } }) => setCell(row.key, col.key, e.target.value);
    switch (col.kind) {
      case "status":
        return (
          <select {...common} value={value} onChange={onChange}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        );
      case "division":
        return (
          <select {...common} value={value} onChange={onChange}>
            <option value="">—</option>
            {divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        );
      case "side":
        return <input {...common} value={value} onChange={onChange} list="schedule-side-options" />;
      case "score":
        return <input {...common} value={value} onChange={onChange} inputMode="numeric" className={`${common.className} tabular-nums`} />;
      case "number":
        return <input {...common} value={value} onChange={onChange} inputMode="numeric" />;
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

      <datalist id="schedule-side-options">
        {sideOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <div className="card relative overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-divider text-left text-[0.6875rem] uppercase tracking-wider text-muted">
              <th className="px-2 py-2 font-bold">#</th>
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
                  No games yet - add the first one below.
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const rowErrors = errors?.byRow.get(row.key);
              const up = neighbour(i, -1);
              const down = neighbour(i, 1);
              return (
                <Fragment key={row.key}>
                  <tr
                    className={`border-b border-border ${row.deleted ? "opacity-50 [&_input]:line-through" : ""} ${
                      rowErrors ? "bg-danger-tint" : ""
                    } ${!row.original ? "shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
                  >
                    <td className="px-2 py-1 tabular-nums text-muted">{i + 1}</td>
                    {row.locked ? (
                      <td colSpan={columns.length} className="px-1.5 py-1.5">
                        <span className="font-semibold">{row.locked}</span>{" "}
                        <span className="text-muted">- more than two schools, so it&apos;s edited from its own page.</span>
                      </td>
                    ) : (
                      columns.map((c) => (
                        <td key={c.key} className="px-0.5 py-0.5">
                          {renderCell(row, c)}
                        </td>
                      ))
                    )}
                    <td className="whitespace-nowrap px-1 py-0.5">
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => move(i, -1)}
                        disabled={pending || row.deleted || !!row.locked || up < 0 || !!rows[up]?.locked}
                        aria-label={`Move row ${i + 1} up`}
                        title="Swap time and court with the game above"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => move(i, 1)}
                        disabled={pending || row.deleted || !!row.locked || down < 0 || !!rows[down]?.locked}
                        aria-label={`Move row ${i + 1} down`}
                        title="Swap time and court with the game below"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => insertBelow(i)}
                        disabled={pending}
                        aria-label={`Add a game after row ${i + 1}`}
                        title="Add a game after this one"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`${iconButton} ${row.deleted ? "w-auto px-1.5 text-xs font-semibold text-primary" : "hover:text-danger"}`}
                        onClick={() => remove(row)}
                        disabled={pending}
                        aria-label={row.deleted ? `Keep row ${i + 1}` : `Delete row ${i + 1}`}
                        title={row.deleted ? "Keep this game" : "Delete this game"}
                      >
                        {row.deleted ? "Undo" : "✕"}
                      </button>
                      {row.eventId && (
                        <Link
                          href={`/dashboard/events/${row.eventId}`}
                          className={`${iconButton} w-auto px-1.5 text-xs font-semibold text-primary`}
                          title="Recap, photos, set scores and more"
                        >
                          Open
                        </Link>
                      )}
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

      <button type="button" onClick={addAtEnd} disabled={pending} className="btn btn-secondary">
        + Add a game
      </button>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-divider bg-background px-4 py-3 sm:mx-0">
        <span className="mr-auto text-sm text-muted">
          {changeCount === 0 ? "No unsaved changes" : `${changeCount} game${changeCount === 1 ? "" : "s"} changed - not saved yet`}
        </span>
        <button type="button" onClick={discard} disabled={pending || changeCount === 0} className="btn btn-secondary">
          Discard changes
        </button>
        <button type="button" onClick={save} disabled={pending || changeCount === 0} className="btn btn-primary">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
