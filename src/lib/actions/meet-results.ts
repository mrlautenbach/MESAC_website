"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { meetResultRowSchema } from "@/lib/validation";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";
import { createGuestSchools } from "@/lib/newSchools";
import type { ActionResult } from "@/lib/actions/auth";

export type ImportMeetResultsResult =
  | { ok: true; imported: number; newSchools: string[] }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

const REQUIRED_HEADERS = ["event_name", "name", "school", "mark"];

// A per-session (one Event = one day/round of a meet) CSV of individual
// placings - separate from, and additive to, the whole-session results
// document. Each import fully replaces this event's existing MeetResult
// rows, so correcting a mistake just means re-uploading the fixed file.
export async function importMeetResultsAction(
  _prevState: ImportMeetResultsResult | null,
  formData: FormData
): Promise<ImportMeetResultsResult> {
  const admin = await requireAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const addNewSchools = formData.get("addNewSchools") === "on";
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { tournament: { include: { activity: true } }, division: true, programEntries: true },
  });
  if (!event) return { ok: false, error: "Event not found." };
  if (!event.tournament.activity.usesMeetResults) {
    return { ok: false, error: "This activity doesn't use meet results." };
  }

  const file = formData.get("csvFile");
  const pastedText = formData.get("csvText");
  const text = file instanceof File && file.size > 0 ? await file.text() : typeof pastedText === "string" ? pastedText : "";
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." };

  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one result row." };

  const { header, records } = csvRowsToObjects(rows);
  if (REQUIRED_HEADERS.some((h) => !header.includes(h))) {
    return {
      ok: false,
      error: "The header row needs at least: event_name, name, school, mark (plus optional round, event_number, place, points, record).",
    };
  }

  const schools = await prisma.school.findMany();
  const schoolByKey = new Map<string, (typeof schools)[number]>();
  for (const s of schools) {
    schoolByKey.set(s.name.trim().toLowerCase(), s);
    if (s.code) schoolByKey.set(s.code.trim().toLowerCase(), s);
  }

  const rowErrors: { row: number; message: string }[] = [];
  const planned: {
    eventName: string;
    round: "PRELIM" | "FINAL";
    place: number | null;
    athleteName: string;
    // An existing school's id, or null for a new school (newSchoolName) that's
    // only added once the whole file checks out.
    schoolId: string | null;
    newSchoolName: string | null;
    mark: string;
    seedMark: string | null;
    prelimMark: string | null;
    points: number | null;
    recordNotation: string | null;
    rowOrder: number;
    divisionId: string | null;
    gender: "GIRLS" | "BOYS" | null;
  }[] = [];

  records.forEach((record, i) => {
    const rowNum = i + 2; // header is row 1
    if (Object.values(record).every((v) => v === "")) return;

    const schoolRaw = (record.school ?? "").trim();
    const school = schoolByKey.get(schoolRaw.toLowerCase());
    if (!schoolRaw) {
      rowErrors.push({ row: rowNum, message: "Missing school." });
      return;
    }
    if (!school && !addNewSchools) {
      rowErrors.push({ row: rowNum, message: `Unknown school "${schoolRaw}".` });
      return;
    }

    const roundRaw = (record.round || "final").trim().toLowerCase();
    const round = roundRaw.startsWith("p") ? "PRELIM" : roundRaw.startsWith("f") ? "FINAL" : null;
    if (!round) {
      rowErrors.push({ row: rowNum, message: `Invalid round "${record.round}" (use "prelim" or "final").` });
      return;
    }

    const parsed = meetResultRowSchema.omit({ schoolId: true }).safeParse({
      eventName: record.event_name,
      round,
      eventNumber: record.event_number ?? "",
      place: record.place ?? "",
      athleteName: record.name,
      mark: record.mark,
      seedMark: record.seed ?? "",
      prelimMark: record.prelim_time ?? "",
      points: record.points ?? "",
      recordNotation: record.record ?? "",
    });
    if (!parsed.success) {
      rowErrors.push({ row: rowNum, message: parsed.error.issues[0]?.message ?? "Invalid row." });
      return;
    }

    // Division/gender come from the matching program entry, not from this
    // CSV - a session's program is the source of truth for how its named
    // events are split. Most sessions only ever have one program entry per
    // (event_name, round), so event_number is optional and only needed to
    // pick between two entries that happen to share a name (e.g. the same
    // race name run for two divisions or genders).
    let divisionId: string | null = null;
    let gender: "GIRLS" | "BOYS" | null = null;
    if (event.programEntries.length > 0) {
      const candidates =
        parsed.data.eventNumber !== null
          ? event.programEntries.filter((p) => p.eventNumber === parsed.data.eventNumber && p.round === round)
          : event.programEntries.filter(
              (p) => p.eventName.trim().toLowerCase() === parsed.data.eventName.trim().toLowerCase() && p.round === round
            );
      if (parsed.data.eventNumber !== null && candidates.length === 0) {
        rowErrors.push({ row: rowNum, message: `No program entry for event_number ${parsed.data.eventNumber} (${round.toLowerCase()}).` });
        return;
      }
      if (candidates.length > 1) {
        rowErrors.push({
          row: rowNum,
          message: `Multiple program entries share event_name "${record.event_name}" for this round - add an event_number column to say which one.`,
        });
        return;
      }
      if (candidates.length === 1) {
        divisionId = candidates[0].divisionId;
        gender = candidates[0].gender;
      }
    }

    planned.push({
      eventName: parsed.data.eventName,
      round: parsed.data.round,
      place: parsed.data.place,
      athleteName: parsed.data.athleteName,
      schoolId: school?.id ?? null,
      newSchoolName: school ? null : schoolRaw,
      mark: parsed.data.mark,
      seedMark: parsed.data.seedMark || null,
      prelimMark: parsed.data.prelimMark || null,
      points: parsed.data.points,
      recordNotation: parsed.data.recordNotation || null,
      rowOrder: i,
      divisionId,
      gender,
    });
  });

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is imported.`, rowErrors };
  }
  if (planned.length === 0) return { ok: false, error: "No result rows found in the file." };

  const newSchoolNames = await prisma.$transaction(async (tx) => {
    const newSchools = await createGuestSchools(
      tx,
      planned.flatMap((p) => (p.newSchoolName ? [p.newSchoolName] : [])),
      admin
    );
    await tx.meetResult.deleteMany({ where: { eventId: event.id } });
    await tx.meetResult.createMany({
      data: planned.map(({ newSchoolName, schoolId, ...p }) => ({
        eventId: event.id,
        ...p,
        schoolId: schoolId ?? newSchools.get(newSchoolName!.toLowerCase())!.id,
      })),
    });
    return [...newSchools.values()].map((s) => s.name);
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "MEET_RESULTS_IMPORT",
    entityType: "MeetResult",
    entityId: event.id,
    summary: `${admin.name} imported ${planned.length} meet result(s) for this event from a CSV file`,
    after: { count: planned.length },
  });

  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  revalidatePath(`/dashboard/events/${event.id}`);
  if (newSchoolNames.length > 0) revalidatePath("/dashboard/admin/schools");
  return { ok: true, imported: planned.length, newSchools: newSchoolNames };
}

export async function clearMeetResultsAction(eventId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { tournament: true } });
  if (!event) return { ok: false, error: "Event not found." };

  const { count } = await prisma.meetResult.deleteMany({ where: { eventId } });
  if (count === 0) return { ok: true };

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "MEET_RESULTS_CLEAR",
    entityType: "MeetResult",
    entityId: event.id,
    summary: `${admin.name} cleared ${count} meet result(s) for this event`,
    before: { count },
  });

  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  revalidatePath(`/dashboard/events/${event.id}`);
  return { ok: true };
}
