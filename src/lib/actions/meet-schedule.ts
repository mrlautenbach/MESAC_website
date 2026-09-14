"use server";

import { revalidatePath } from "next/cache";
import { revalidateTournament } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";
import { normalizeDivisionName } from "@/lib/divisionAlias";

export type ImportMeetScheduleResult =
  | { ok: true; rounds: number; sessions: number; newSessions: number }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

const REQUIRED_HEADERS = ["date", "session", "event_number", "event_name"];
const STATUS_VALUES = new Set(["SCHEDULED", "COMPLETED", "CANCELLED"]);

type ParsedRow = {
  rowNum: number;
  sessionName: string;
  sessionDateKey: string; // yyyy-mm-dd, for same-file session-date consistency checks
  sessionDate: Date;
  scheduledTime: Date;
  eventNumber: number;
  eventName: string;
  roundRaw: "PRELIM" | "FINAL" | null; // null = not given on this row
  divisionId: string | null;
  gender: "GIRLS" | "BOYS" | null;
  location: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  liveStreamUrl: string | null;
};

type PlannedEntry = ParsedRow & { round: "PRELIM" | "FINAL" };

// The combined schedule+program CSV for a meet: one row per (event, round),
// replacing the old two-file schedule-then-program flow. A session (e.g.
// "Day 1 Prelims") is found-or-created by name as rows reference it - no
// need to set it up separately first. Whether an event_number gets one
// round or two isn't declared up front; it falls out of how many rows
// share that event_number in this file (see the grouping pass below).
// Results (place/time/points) are still a separate, per-session upload -
// see meet-results.ts.
export async function importMeetScheduleAction(
  _prevState: ImportMeetScheduleResult | null,
  formData: FormData
): Promise<ImportMeetScheduleResult> {
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
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one event row." };

  const { header, records } = csvRowsToObjects(rows);
  if (REQUIRED_HEADERS.some((h) => !header.includes(h))) {
    return {
      ok: false,
      error:
        "The header row needs at least: date, session, event_number, event_name (plus optional round, gender, division, location, status, live_stream, time).",
    };
  }

  const existingSessions = await prisma.event.findMany({
    where: { tournamentId: tournament.id },
    select: { id: true, title: true },
  });
  const sessionIdByName = new Map(
    existingSessions.filter((s) => s.title).map((s) => [s.title!.trim().toLowerCase(), s.id])
  );
  const divisionByName = new Map(tournament.divisions.map((d) => [normalizeDivisionName(d.name), d]));
  const requiresDivision = tournament.divisions.length > 0;

  const rowErrors: { row: number; message: string }[] = [];
  const fail = (rowNum: number, message: string) => rowErrors.push({ row: rowNum, message });

  const parsedRows: ParsedRow[] = [];

  records.forEach((record, i) => {
    const rowNum = i + 2; // header is row 1
    if (Object.values(record).every((v) => v === "")) return;

    const sessionName = (record.session ?? "").trim();
    if (!sessionName) return fail(rowNum, "Missing session.");

    const dateRaw = (record.date ?? "").trim();
    if (!dateRaw) return fail(rowNum, "Missing date.");
    const timeRaw = (record.time ?? "").trim() || "09:00";
    const scheduledTime = new Date(`${dateRaw}T${timeRaw.length === 5 ? timeRaw : timeRaw.padStart(5, "0")}:00`);
    if (Number.isNaN(scheduledTime.getTime())) {
      return fail(rowNum, `Could not parse date/time "${dateRaw} ${timeRaw}" (use YYYY-MM-DD and HH:MM).`);
    }
    const sessionDate = new Date(`${dateRaw}T00:00:00`);

    const eventNumberRaw = (record.event_number ?? "").trim();
    const eventNumber = Number(eventNumberRaw);
    if (!eventNumberRaw || !Number.isInteger(eventNumber) || eventNumber < 1) {
      return fail(rowNum, `Invalid event_number "${eventNumberRaw}".`);
    }

    const eventName = (record.event_name ?? "").trim();
    if (!eventName) return fail(rowNum, "Missing event_name.");

    const roundCell = (record.round ?? "").trim().toLowerCase();
    let roundRaw: "PRELIM" | "FINAL" | null = null;
    if (roundCell) {
      if (roundCell.startsWith("p")) roundRaw = "PRELIM";
      else if (roundCell.startsWith("f")) roundRaw = "FINAL";
      else return fail(rowNum, `Invalid round "${record.round}" (use "prelim" or "final").`);
    }

    const divisionRaw = (record.division ?? "").trim();
    let divisionId: string | null = null;
    if (divisionRaw) {
      const division = divisionByName.get(normalizeDivisionName(divisionRaw));
      if (!division) return fail(rowNum, `Unknown division "${divisionRaw}" (set up this tournament's divisions first).`);
      divisionId = division.id;
    } else if (requiresDivision) {
      return fail(rowNum, "This tournament has divisions. Set the division column.");
    }

    const genderRaw = (record.gender ?? "").trim().toLowerCase();
    let gender: "GIRLS" | "BOYS" | null = null;
    if (genderRaw) {
      if (genderRaw.startsWith("g")) gender = "GIRLS";
      else if (genderRaw.startsWith("b")) gender = "BOYS";
      else return fail(rowNum, `Invalid gender "${record.gender}" (use "girls" or "boys").`);
    }

    const statusRaw = (record.status || "SCHEDULED").trim().toUpperCase();
    if (!STATUS_VALUES.has(statusRaw)) {
      return fail(rowNum, `Invalid status "${record.status}" (use SCHEDULED, COMPLETED, or CANCELLED).`);
    }

    const liveStreamRaw = (record.live_stream ?? "").trim();
    if (liveStreamRaw && !/^https?:\/\//i.test(liveStreamRaw)) {
      return fail(rowNum, `live_stream "${liveStreamRaw}" must start with http:// or https://.`);
    }

    parsedRows.push({
      rowNum,
      sessionName,
      // The raw YYYY-MM-DD string, not a round-trip through Date/toISOString
      // (which would re-express it in UTC and can shift the calendar day
      // whenever the server's local timezone isn't UTC).
      sessionDateKey: dateRaw,
      sessionDate,
      scheduledTime,
      eventNumber,
      eventName,
      roundRaw,
      divisionId,
      gender,
      location: (record.location ?? "").trim() || null,
      status: statusRaw as ParsedRow["status"],
      liveStreamUrl: liveStreamRaw || null,
    });
  });

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is imported.`, rowErrors };
  }
  if (parsedRows.length === 0) return { ok: false, error: "No event rows found in the file." };

  // Round is decided by how many rows share this event_number, not by an
  // upfront declaration - one row is a lone "final"; two rows must name one
  // "prelim" and one "final" between them (in either order).
  const byEventNumber = new Map<number, ParsedRow[]>();
  for (const row of parsedRows) {
    const list = byEventNumber.get(row.eventNumber) ?? [];
    list.push(row);
    byEventNumber.set(row.eventNumber, list);
  }

  const planned: PlannedEntry[] = [];
  for (const [eventNumber, group] of byEventNumber) {
    if (group.length === 1) {
      const row = group[0];
      planned.push({ ...row, round: row.roundRaw ?? "FINAL" });
    } else if (group.length === 2) {
      const [a, b] = group;
      if (!a.roundRaw || !b.roundRaw) {
        fail(b.rowNum, `event_number ${eventNumber} appears twice - set round to "prelim" or "final" on both rows.`);
      } else if (a.roundRaw === b.roundRaw) {
        fail(
          b.rowNum,
          `event_number ${eventNumber} is listed twice as ${a.roundRaw.toLowerCase()} - it needs one prelim row and one final row.`
        );
      } else {
        planned.push({ ...a, round: a.roundRaw }, { ...b, round: b.roundRaw });
      }
    } else {
      fail(
        group[group.length - 1].rowNum,
        `event_number ${eventNumber} appears ${group.length} times - an event can have at most a prelim and a final round.`
      );
    }
  }

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is imported.`, rowErrors };
  }

  // Catch a same-file inconsistency: two rows claiming the same (new)
  // session name on two different dates. An existing session's own date is
  // left alone either way - only used to seed a brand-new session.
  const newSessionDateByName = new Map<string, string>();
  for (const row of planned) {
    const key = row.sessionName.toLowerCase();
    if (sessionIdByName.has(key)) continue;
    const seenDate = newSessionDateByName.get(key);
    if (!seenDate) newSessionDateByName.set(key, row.sessionDateKey);
    else if (seenDate !== row.sessionDateKey) {
      fail(
        row.rowNum,
        `Session "${row.sessionName}" was already set up for ${seenDate} earlier in this file - this row says ${row.sessionDateKey}.`
      );
    }
  }
  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is imported.`, rowErrors };
  }

  const touchedEventNumbers = Array.from(byEventNumber.keys());

  const { createdSessions, entryCount, touchedSessionIds } = await prisma.$transaction(async (tx) => {
    const claimedSlugs = new Set<string>();
    const sessionIdCache = new Map(sessionIdByName);
    let createdSessions = 0;

    for (const row of planned) {
      const key = row.sessionName.toLowerCase();
      if (sessionIdCache.has(key)) continue;

      const base = row.sessionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90) || "session";
      let slug = base;
      let suffix = 1;
      while (
        claimedSlugs.has(slug) ||
        (await tx.event.findUnique({ where: { tournamentId_slug: { tournamentId: tournament.id, slug } } }))
      ) {
        suffix += 1;
        slug = `${base}-${suffix}`;
      }
      claimedSlugs.add(slug);

      const session = await tx.event.create({
        data: { tournamentId: tournament.id, slug, title: row.sessionName, date: row.sessionDate },
      });
      sessionIdCache.set(key, session.id);
      createdSessions += 1;
    }

    const entries = planned.map((row) => ({
      tournamentId: tournament.id,
      eventId: sessionIdCache.get(row.sessionName.toLowerCase())!,
      divisionId: row.divisionId,
      gender: row.gender,
      eventNumber: row.eventNumber,
      eventName: row.eventName,
      round: row.round,
      scheduledTime: row.scheduledTime,
      location: row.location,
      liveStreamUrl: row.liveStreamUrl,
      status: row.status,
    }));

    // event_number (not session) is this race's true identity now - replace
    // whichever existing rows share one of this file's event_numbers,
    // regardless of which session they were previously attached to, so an
    // event that moved sessions between uploads doesn't leave a stale copy
    // behind under its old one.
    await tx.meetProgramEntry.deleteMany({
      where: { tournamentId: tournament.id, eventNumber: { in: touchedEventNumbers } },
    });
    await tx.meetProgramEntry.createMany({ data: entries });

    return {
      createdSessions,
      entryCount: entries.length,
      touchedSessionIds: Array.from(new Set(entries.map((e) => e.eventId))),
    };
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "MEET_SCHEDULE_IMPORT",
    entityType: "MeetProgramEntry",
    entityId: tournament.id,
    summary: `${admin.name} imported a ${entryCount}-round meet schedule (${createdSessions} new session${createdSessions === 1 ? "" : "s"}) for ${tournament.name} from a CSV file`,
    after: { count: entryCount, sessions: touchedSessionIds.length, createdSessions },
  });

  const touchedEvents = await prisma.event.findMany({ where: { id: { in: touchedSessionIds } }, select: { slug: true } });
  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  for (const e of touchedEvents) revalidatePath(`/seasons/${tournament.slug}/events/${e.slug}`);
  revalidatePath("/dashboard/admin/meet-schedule");

  return { ok: true, rounds: entryCount, sessions: touchedSessionIds.length, newSessions: createdSessions };
}
