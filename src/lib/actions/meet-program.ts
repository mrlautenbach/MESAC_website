"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { meetProgramRowSchema } from "@/lib/validation";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";
import { normalizeDivisionName } from "@/lib/divisionAlias";
import type { ActionResult } from "@/lib/actions/auth";

export type ImportMeetProgramResult =
  | { ok: true; imported: number; sessions: number }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

const REQUIRED_HEADERS = ["session", "event_number", "event_name"];

// One CSV covering the whole meet: which named events exist in which
// session, in what order, and for which round(s) - set up ahead of results
// so a not-yet-run event still shows up on the public page. Separate from,
// and independent of, the per-session MeetResult CSVs (see meet-results.ts).
// A session is matched by its Event.title within this tournament - it must
// already exist (created from the schedule) before it can appear here.
export async function importMeetProgramAction(
  _prevState: ImportMeetProgramResult | null,
  formData: FormData
): Promise<ImportMeetProgramResult> {
  const admin = await requireAdmin();

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: true, divisions: true },
  });
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (!tournament.activity.usesMeetResults) {
    return { ok: false, error: "This activity doesn't use meet results." };
  }

  const file = formData.get("csvFile");
  const pastedText = formData.get("csvText");
  const text = file instanceof File && file.size > 0 ? await file.text() : typeof pastedText === "string" ? pastedText : "";
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." };

  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one program row." };

  const { header, records } = csvRowsToObjects(rows);
  if (REQUIRED_HEADERS.some((h) => !header.includes(h))) {
    return {
      ok: false,
      error: "The header row needs at least: session, event_number, event_name (plus optional round, division, gender).",
    };
  }

  const sessions = await prisma.event.findMany({ where: { tournamentId: tournament.id }, select: { id: true, title: true } });
  const sessionByTitle = new Map<string, string>();
  for (const s of sessions) {
    if (s.title) sessionByTitle.set(s.title.trim().toLowerCase(), s.id);
  }
  const divisionByName = new Map(tournament.divisions.map((d) => [normalizeDivisionName(d.name), d]));

  const rowErrors: { row: number; message: string }[] = [];
  const seenPerEvent = new Map<string, Set<string>>();
  const planned: {
    eventId: string;
    eventNumber: number;
    eventName: string;
    round: "PRELIM" | "FINAL";
    divisionId: string | null;
    gender: "GIRLS" | "BOYS" | null;
  }[] = [];

  records.forEach((record, i) => {
    const rowNum = i + 2; // header is row 1
    if (Object.values(record).every((v) => v === "")) return;

    const sessionRaw = record.session ?? "";
    const eventId = sessionByTitle.get(sessionRaw.trim().toLowerCase());
    if (!eventId) {
      rowErrors.push({
        row: rowNum,
        message: `Unknown session "${sessionRaw}" - create it first from the schedule (its title must match exactly).`,
      });
      return;
    }

    const roundRaw = (record.round || "final").trim().toLowerCase();
    const round = roundRaw.startsWith("p") ? "PRELIM" : roundRaw.startsWith("f") ? "FINAL" : null;
    if (!round) {
      rowErrors.push({ row: rowNum, message: `Invalid round "${record.round}" (use "prelim" or "final").` });
      return;
    }

    const divisionRaw = (record.division ?? "").trim();
    let divisionId: string | null = null;
    if (divisionRaw) {
      const division = divisionByName.get(normalizeDivisionName(divisionRaw));
      if (!division) {
        rowErrors.push({ row: rowNum, message: `Unknown division "${divisionRaw}" (set up this tournament's divisions first).` });
        return;
      }
      divisionId = division.id;
    }

    const genderRaw = (record.gender ?? "").trim().toLowerCase();
    const gender = genderRaw ? (genderRaw.startsWith("g") ? "GIRLS" : genderRaw.startsWith("b") ? "BOYS" : null) : null;
    if (genderRaw && !gender) {
      rowErrors.push({ row: rowNum, message: `Invalid gender "${record.gender}" (use "girls" or "boys").` });
      return;
    }

    const parsed = meetProgramRowSchema.safeParse({
      eventId,
      eventNumber: record.event_number,
      eventName: record.event_name,
      round,
      divisionId,
      gender,
    });
    if (!parsed.success) {
      rowErrors.push({ row: rowNum, message: parsed.error.issues[0]?.message ?? "Invalid row." });
      return;
    }

    // event_number (not event_name) is this race's identity - a prelim row
    // and a final row sharing the same number are meant to pair up, even if
    // their names differ slightly, so only event_number+round is checked
    // for duplicates here.
    const dupKey = `${parsed.data.eventNumber} ${parsed.data.round}`;
    const seen = seenPerEvent.get(parsed.data.eventId) ?? new Set<string>();
    if (seen.has(dupKey)) {
      rowErrors.push({ row: rowNum, message: `Duplicate entry for this session (event_number/round already used).` });
      return;
    }
    seen.add(dupKey);
    seenPerEvent.set(parsed.data.eventId, seen);

    planned.push(parsed.data);
  });

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is imported.`, rowErrors };
  }
  if (planned.length === 0) return { ok: false, error: "No program rows found in the file." };

  const touchedEventIds = Array.from(new Set(planned.map((p) => p.eventId)));

  await prisma.$transaction([
    prisma.meetProgramEntry.deleteMany({ where: { eventId: { in: touchedEventIds } } }),
    prisma.meetProgramEntry.createMany({ data: planned }),
  ]);

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "MEET_PROGRAM_IMPORT",
    entityType: "MeetProgramEntry",
    entityId: tournament.id,
    summary: `${admin.name} imported a ${planned.length}-event meet program across ${touchedEventIds.length} session(s) for ${tournament.name} from a CSV file`,
    after: { count: planned.length, sessions: touchedEventIds.length },
  });

  const events = await prisma.event.findMany({ where: { id: { in: touchedEventIds } }, select: { slug: true } });
  revalidatePath(`/seasons/${tournament.slug}`);
  for (const e of events) revalidatePath(`/seasons/${tournament.slug}/events/${e.slug}`);
  revalidatePath(`/dashboard/admin/meet-program`);

  return { ok: true, imported: planned.length, sessions: touchedEventIds.length };
}

export async function clearMeetProgramAction(eventId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { tournament: true } });
  if (!event) return { ok: false, error: "Event not found." };

  const { count } = await prisma.meetProgramEntry.deleteMany({ where: { eventId } });
  if (count === 0) return { ok: true };

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "MEET_PROGRAM_CLEAR",
    entityType: "MeetProgramEntry",
    entityId: event.id,
    summary: `${admin.name} cleared ${count} meet program entr${count === 1 ? "y" : "ies"} for this session`,
    before: { count },
  });

  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  revalidatePath(`/dashboard/admin/meet-program`);
  return { ok: true };
}
