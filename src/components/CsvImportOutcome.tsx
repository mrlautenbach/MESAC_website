type RowError = { row: number; message: string };

// A CSV upload that didn't go in: what's wrong with the file, then each row
// to fix - nothing is saved until every row is right.
export function CsvImportErrors({ error, rowErrors }: { error: string; rowErrors?: RowError[] }) {
  return (
    <div role="alert" className="space-y-2 bg-danger-tint px-4 py-3 text-sm text-danger">
      <p className="font-semibold">{error}</p>
      {rowErrors && rowErrors.length > 0 && (
        <ul className="list-inside list-disc space-y-1">
          {rowErrors.map((e, i) => (
            <li key={i}>
              Row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// An upload's result for the forms whose actions describe what they saved
// in one line.
export function CsvImportOutcome({
  state,
}: {
  state: { ok: true; summary: string } | { ok: false; error: string; rowErrors?: RowError[] } | null;
}) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p role="status" className="bg-success-tint px-3 py-2 text-sm text-success">
        {state.summary}
      </p>
    );
  }
  return <CsvImportErrors error={state.error} rowErrors={state.rowErrors} />;
}
