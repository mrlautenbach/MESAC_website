// Minimal RFC-4180-ish CSV parser: handles quoted fields (with embedded
// commas/newlines), escaped quotes (""), and CRLF/LF line endings. No
// external dependency needed for the bulk-event-import feature.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function csvRowsToObjects(rows: string[][]): { header: string[]; records: Record<string, string>[] } {
  const [header, ...body] = rows;
  const normalizedHeader = (header ?? []).map((h) => h.trim().toLowerCase());
  const records = body.map((cells) => {
    const record: Record<string, string> = {};
    normalizedHeader.forEach((key, idx) => {
      record[key] = (cells[idx] ?? "").trim();
    });
    return record;
  });
  return { header: normalizedHeader, records };
}
