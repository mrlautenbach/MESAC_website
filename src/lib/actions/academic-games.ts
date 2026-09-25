"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { revalidateTournament } from "@/lib/revalidate";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";
import { findDivision, normalizeDivisionName } from "@/lib/divisionAlias";
import { parseClock, RUN_BY_FIELD } from "@/lib/academicGames";

export type ImportAcademicScheduleResult =
  | { ok: true; created: number; updated: number; removed: number; newDivisions: string[] }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

const REQUIRED_HEADERS = ["date", "start", "title"];
// A blank team cell means every team; so do these.
const EVERYONE = new Set(["all", "both", "everyone", "all teams"]);
// The two tracks the upload can add on its own if the tournament doesn't
// have them yet - anything else has to be set up as a division first.
const TRACK_NAMES: Record<string, string> = { varsity: "Varsity", "junior varsity": "Junior Varsity" };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type PlannedItem = {
  rowNum: number;
  start: Date;
  end: Date | null;
  title: string;
  venue: string | null;
  runBy: string | null;
  // An existing division's id, or the name of one to add (see TRACK_NAMES).
  division: { id: string } | { newName: string } | null;
};

// The day, title and track together identify one item - a re-upload
// updates it in place (keeping its page, photos and edits to other fields)
// instead of replacing it, and an item missing from the new file is removed.
const itemKey = (day: string, title: string, division: string | null) => `${day}|${title.toLowerCase()}|${division ?? ""}`;

// Academic Games' whole timeline from one CSV: date, start, end, title,
// team (varsity / jv / blank for everyone), venue, run_by. Every row is
// checked before anything is saved, and the file is the full schedule -
// items not in it are removed.
export async function importAcademicScheduleAction(
  _prev: ImportAcademicScheduleResult | null,
  formData: FormData
): Promise<ImportAcademicScheduleResult> {
  const admin = await requireAdmin();

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: true, divisions: true, events: { include: { fieldValues: { include: { field: true } } } } },
  });
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (!tournament.activity.usesAcademicFormat) {
    return { ok: false, error: "This activity doesn't use the Academic Games format." };
  }

  const file = formData.get("csvFile");
  const pasted = formData.get("csvText");
  const text = file instanceof File && file.size > 0 ? await file.text() : typeof pasted === "string" ? pasted : "";
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." };

  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one schedule row." };
  const { header, records } = csvRowsToObjects(rows);
  if (REQUIRED_HEADERS.some((h) => !header.includes(h))) {
    return { ok: false, error: "The header row needs at least: date, start, title (plus optional end, team, venue, run_by)." };
  }

  const rowErrors: { row: number; message: string }[] = [];
  const planned: PlannedItem[] = [];
  const keyRows = new Map<string, number>();
  const trackNames = [...tournament.divisions.map((d) => d.name), ...Object.values(TRACK_NAMES)];

  records.forEach((record, i) => {
    const rowNum = i + 2; // header is row 1
    if (Object.values(record).every((v) => !v.trim())) return;
    const get = (name: string) => (record[name] ?? "").trim();
    const errors: string[] = [];

    const dateRaw = get("date");
    const day = dateRaw.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(`${dateRaw}T00:00:00`) : null;
    if (!day || Number.isNaN(day.getTime())) errors.push(`Date "${dateRaw}" must be YYYY-MM-DD.`);

    const at = (raw: string, label: string) => {
      const time = parseClock(raw);
      if (!time) {
        errors.push(`${label} "${raw}" isn't a time (use 13:45 or 1:45pm).`);
        return null;
      }
      if (!day) return null;
      const d = new Date(day);
      d.setHours(time.hours, time.minutes, 0, 0);
      return d;
    };
    const startRaw = get("start");
    const start = startRaw ? at(startRaw, "Start") : (errors.push("Missing start time."), null);
    const endRaw = get("end");
    const end = endRaw ? at(endRaw, "End") : null;
    if (start && end && end <= start) errors.push(`End ${endRaw} is before the start ${startRaw}.`);

    const title = get("title");
    if (!title) errors.push("Missing title.");
    else if (title.length > 200) errors.push("Title is over 200 characters.");

    const teamRaw = get("team");
    let division: PlannedItem["division"] = null;
    if (teamRaw && !EVERYONE.has(teamRaw.toLowerCase())) {
      const existing = findDivision(tournament.divisions, teamRaw);
      const trackName = TRACK_NAMES[normalizeDivisionName(teamRaw)];
      if (existing) division = { id: existing.id };
      else if (trackName) division = { newName: trackName };
      else errors.push(`Unknown team "${teamRaw}" (use ${[...new Set(trackNames)].join(", ")}, or leave it blank for every team).`);
    }

    if (errors.length > 0) {
      rowErrors.push({ row: rowNum, message: errors.join(" ") });
      return;
    }

    const divisionKey = division ? ("id" in division ? division.id : `new:${division.newName}`) : null;
    const key = itemKey(dateRaw, title, divisionKey);
    if (keyRows.has(key)) {
      rowErrors.push({ row: rowNum, message: `"${title}" is already on ${dateRaw} for this team (row ${keyRows.get(key)}).` });
      return;
    }
    keyRows.set(key, rowNum);
    planned.push({
      rowNum,
      start: start!,
      end,
      title,
      venue: get("venue").slice(0, 200) || null,
      runBy: get("run_by").slice(0, 200) || null,
      division,
    });
  });

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is saved.`, rowErrors };
  }
  if (planned.length === 0) return { ok: false, error: "No schedule rows found in the file." };

  const result = await prisma.$transaction(async (tx) => {
    // Varsity / Junior Varsity, when this is the first upload to use them.
    const newDivisionNames = [
      ...new Set(planned.flatMap((p) => (p.division && "newName" in p.division ? [p.division.newName] : []))),
    ];
    const newDivisionIds = new Map<string, string>();
    for (const name of newDivisionNames) {
      const created = await tx.division.create({
        data: { activityId: tournament.activityId, tournamentId: tournament.id, name, slug: slugify(name) },
      });
      newDivisionIds.set(name, created.id);
    }
    const divisionIdOf = (p: PlannedItem) =>
      p.division ? ("id" in p.division ? p.division.id : newDivisionIds.get(p.division.newName)!) : null;

    const runByField = planned.some((p) => p.runBy)
      ? await tx.activityField.upsert({
          where: { activityId_key: { activityId: tournament.activityId, key: RUN_BY_FIELD.key } },
          create: { activityId: tournament.activityId, ...RUN_BY_FIELD },
          update: {},
        })
      : await tx.activityField.findUnique({
          where: { activityId_key: { activityId: tournament.activityId, key: RUN_BY_FIELD.key } },
        });

    const existingByKey = new Map(
      tournament.events.map((e) => [itemKey(format(e.date, "yyyy-MM-dd"), e.title ?? "", e.divisionId), e])
    );
    const claimedSlugs = new Set(tournament.events.map((e) => e.slug));
    const kept = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const item of planned) {
      const divisionId = divisionIdOf(item);
      const existing = existingByKey.get(itemKey(format(item.start, "yyyy-MM-dd"), item.title, divisionId));
      const data = { date: item.start, endDate: item.end, title: item.title, location: item.venue, divisionId };
      let eventId: string;
      if (existing) {
        await tx.event.update({ where: { id: existing.id }, data });
        eventId = existing.id;
        kept.add(existing.id);
        updated++;
      } else {
        const base = slugify(`${format(item.start, "yyyy-MM-dd")}-${item.title}`) || "item";
        let slug = base;
        for (let n = 2; claimedSlugs.has(slug); n++) slug = `${base}-${n}`;
        claimedSlugs.add(slug);
        eventId = (await tx.event.create({ data: { ...data, tournamentId: tournament.id, slug } })).id;
        created++;
      }
      if (runByField) {
        if (item.runBy) {
          await tx.eventFieldValue.upsert({
            where: { eventId_fieldId: { eventId, fieldId: runByField.id } },
            create: { eventId, fieldId: runByField.id, value: item.runBy },
            update: { value: item.runBy },
          });
        } else {
          await tx.eventFieldValue.deleteMany({ where: { eventId, fieldId: runByField.id } });
        }
      }
    }

    const stale = tournament.events.filter((e) => !kept.has(e.id)).map((e) => e.id);
    if (stale.length > 0) await tx.event.deleteMany({ where: { id: { in: stale } } });
    return { created, updated, removed: stale.length, newDivisions: newDivisionNames };
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACADEMIC_SCHEDULE_IMPORT",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} uploaded the Academic Games schedule (${result.created} added, ${result.updated} updated, ${result.removed} removed)`,
    after: result,
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/academic-games");
  return { ok: true, ...result };
}
