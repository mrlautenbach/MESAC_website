"use server";

import { revalidatePath } from "next/cache";
import { revalidateTournament } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";
import { flightOf, GOLF_SEEDS_PER_SCHOOL } from "@/lib/golf";

// Every golf upload returns the same shape: a one-line summary on success,
// or every row's problem at once so the whole file can be fixed in one go.
export type GolfImportResult =
  | { ok: true; summary: string }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

type RowError = { row: number; message: string };

async function loadGolfTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { activity: true } });
  if (!tournament) return { ok: false, error: "Tournament not found." } as const;
  if (!tournament.activity.usesGolfFormat) return { ok: false, error: "This activity doesn't use the golf format." } as const;
  return { ok: true, tournament } as const;
}

async function readCsv(formData: FormData, required: string[]) {
  const file = formData.get("csvFile");
  const pasted = formData.get("csvText");
  const text = file instanceof File && file.size > 0 ? await file.text() : typeof pasted === "string" ? pasted : "";
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." } as const;
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one row." } as const;
  const { header, records } = csvRowsToObjects(rows);
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length > 0) return { ok: false, error: `The header row is missing: ${missing.join(", ")}.` } as const;
  // Row numbers as the spreadsheet shows them (the header is row 1), with
  // blank lines skipped.
  return {
    ok: true,
    records: records
      .map((record, i) => ({ record, row: i + 2 }))
      .filter(({ record }) => Object.values(record).some((v) => v !== "")),
  } as const;
}

async function schoolLookup() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true, code: true } });
  const byKey = new Map<string, (typeof schools)[number]>();
  for (const s of schools) {
    byKey.set(s.name.trim().toLowerCase(), s);
    if (s.code) byKey.set(s.code.trim().toLowerCase(), s);
  }
  return (raw: string) => byKey.get(raw.trim().toLowerCase());
}

function parseSeed(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= GOLF_SEEDS_PER_SCHOOL ? n : null;
}

function failed(rowErrors: RowError[]): GolfImportResult {
  return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is saved.`, rowErrors };
}

function refresh(tournament: { slug: string; activity: { slug: string } }) {
  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/golf");
}

// The roster: school, seed, name, plus optional grade and gender. Matched by
// school and seed, so re-uploading a corrected file renames a player rather
// than adding a second one, and keeps their tee-time group and score. A
// school's seeds missing from the file are removed - but only for schools
// the file mentions, so one school's roster can be uploaded on its own.
export async function importGolfRosterAction(_prev: GolfImportResult | null, formData: FormData): Promise<GolfImportResult> {
  const admin = await requireAdmin();
  const loaded = await loadGolfTournament(String(formData.get("tournamentId") ?? ""));
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { tournament } = loaded;
  const csv = await readCsv(formData, ["school", "seed", "name"]);
  if (!csv.ok) return { ok: false, error: csv.error };
  const findSchool = await schoolLookup();

  const rowErrors: RowError[] = [];
  const planned: { schoolId: string; seed: number; name: string; grade: number | null; gender: string | null }[] = [];
  const seen = new Map<string, number>();
  for (const { record, row } of csv.records) {
    const school = findSchool(record.school ?? "");
    const seed = parseSeed(record.seed ?? "");
    const name = (record.name ?? "").trim();
    if (!school) rowErrors.push({ row, message: `Unknown school "${record.school}".` });
    if (seed === null) rowErrors.push({ row, message: `Seed "${record.seed}" must be a whole number from 1 to ${GOLF_SEEDS_PER_SCHOOL}.` });
    if (!name) rowErrors.push({ row, message: "Missing name." });
    const gradeRaw = (record.grade ?? "").trim();
    const grade = gradeRaw ? Number(gradeRaw) : null;
    if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 13)) {
      rowErrors.push({ row, message: `Grade "${gradeRaw}" must be a whole number.` });
    }
    const genderRaw = (record.gender ?? "").trim().toLowerCase();
    const gender = !genderRaw ? null : /^(m|male|boy|boys)$/.test(genderRaw) ? "M" : /^(f|female|girl|girls)$/.test(genderRaw) ? "F" : undefined;
    if (gender === undefined) rowErrors.push({ row, message: `Gender "${record.gender}" should be M or F.` });
    if (!school || seed === null || !name || gender === undefined) continue;
    const key = `${school.id}:${seed}`;
    if (seen.has(key)) {
      rowErrors.push({ row, message: `${record.school} seed ${seed} is already in row ${seen.get(key)}.` });
      continue;
    }
    seen.set(key, row);
    planned.push({ schoolId: school.id, seed, name, grade: grade !== null && Number.isInteger(grade) ? grade : null, gender });
  }
  if (rowErrors.length > 0) return failed(rowErrors);

  const schoolIds = [...new Set(planned.map((p) => p.schoolId))];
  const removed = await prisma.$transaction(async (tx) => {
    for (const p of planned) {
      await tx.golfPlayer.upsert({
        where: { tournamentId_schoolId_seed: { tournamentId: tournament.id, schoolId: p.schoolId, seed: p.seed } },
        create: { tournamentId: tournament.id, ...p },
        update: { name: p.name, grade: p.grade, gender: p.gender },
      });
    }
    const stale = await tx.golfPlayer.deleteMany({
      where: {
        tournamentId: tournament.id,
        schoolId: { in: schoolIds },
        NOT: { OR: planned.map((p) => ({ schoolId: p.schoolId, seed: p.seed })) },
      },
    });
    return stale.count;
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "GOLF_ROSTER_IMPORT",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} imported the golf roster for ${tournament.name} (${planned.length} players, ${schoolIds.length} schools)`,
  });
  refresh(tournament);
  return {
    ok: true,
    summary: `Saved ${planned.length} player${planned.length === 1 ? "" : "s"} from ${schoolIds.length} school${schoolIds.length === 1 ? "" : "s"}${removed > 0 ? `, and removed ${removed} no longer in the file` : ""}.`,
  };
}

// The Day 1 draw: one row per player - date, flight, group, tee_time, school,
// seed, plus optional marshal and course (given once per group is enough).
// Replaces the whole draw, so a corrected file is simply uploaded again;
// players' scores are kept.
export async function importGolfDrawAction(_prev: GolfImportResult | null, formData: FormData): Promise<GolfImportResult> {
  const admin = await requireAdmin();
  const loaded = await loadGolfTournament(String(formData.get("tournamentId") ?? ""));
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { tournament } = loaded;
  const csv = await readCsv(formData, ["date", "flight", "group", "tee_time", "school", "seed"]);
  if (!csv.ok) return { ok: false, error: csv.error };
  const findSchool = await schoolLookup();
  const roster = await prisma.golfPlayer.findMany({ where: { tournamentId: tournament.id }, select: { id: true, schoolId: true, seed: true } });
  const rosterByKey = new Map(roster.map((p) => [`${p.schoolId}:${p.seed}`, p]));

  type Group = { number: number; flight: number; teeTime: Date; course: string | null; marshal: string | null; row: number; playerIds: string[] };
  const groups = new Map<number, Group>();
  const placed = new Map<string, number>();
  const rowErrors: RowError[] = [];

  for (const { record, row } of csv.records) {
    const number = Number(record.group);
    const flight = Number(record.flight);
    const time = (record.tee_time ?? "").trim();
    const teeTime = new Date(`${record.date}T${time.length === 4 ? `0${time}` : time}:00`);
    const school = findSchool(record.school ?? "");
    const seed = parseSeed(record.seed ?? "");
    let ok = true;
    const fail = (message: string) => {
      rowErrors.push({ row, message });
      ok = false;
    };
    if (!Number.isInteger(number) || number < 1) fail(`Group "${record.group}" must be a whole number.`);
    if (![1, 2, 3].includes(flight)) fail(`Flight "${record.flight}" must be 1, 2 or 3.`);
    if (Number.isNaN(teeTime.getTime())) fail(`Could not read date/time "${record.date} ${record.tee_time}" (use YYYY-MM-DD and HH:MM).`);
    if (!school) fail(`Unknown school "${record.school}".`);
    if (seed === null) fail(`Seed "${record.seed}" must be a whole number from 1 to ${GOLF_SEEDS_PER_SCHOOL}.`);
    if (!ok || !school || seed === null) continue;

    const player = rosterByKey.get(`${school.id}:${seed}`);
    if (!player) {
      fail(`No player on the roster for ${record.school} seed ${seed} - upload the roster first.`);
      continue;
    }
    if (flightOf(seed) !== flight) {
      fail(`${record.school} seed ${seed} plays in Flight ${flightOf(seed)}, not Flight ${flight}.`);
      continue;
    }
    if (placed.has(player.id)) {
      fail(`${record.school} seed ${seed} is already in row ${placed.get(player.id)}.`);
      continue;
    }

    const course = (record.course ?? "").trim() || null;
    const marshal = (record.marshal ?? "").trim() || null;
    const group = groups.get(number);
    if (!group) {
      groups.set(number, { number, flight, teeTime, course, marshal, row, playerIds: [player.id] });
    } else {
      if (group.flight !== flight) fail(`Group ${number} is Flight ${group.flight} in row ${group.row}.`);
      if (group.teeTime.getTime() !== teeTime.getTime()) fail(`Group ${number} has a different date or tee time in row ${group.row}.`);
      if (course && group.course && course !== group.course) fail(`Group ${number} has a different course in row ${group.row}.`);
      if (marshal && group.marshal && marshal !== group.marshal) fail(`Group ${number} has a different marshal in row ${group.row}.`);
      if (!ok) continue;
      group.course ??= course;
      group.marshal ??= marshal;
      group.playerIds.push(player.id);
    }
    placed.set(player.id, row);
  }
  if (rowErrors.length > 0) return failed(rowErrors);
  if (groups.size === 0) return { ok: false, error: "No player rows found in the file." };

  await prisma.$transaction(async (tx) => {
    await tx.golfGroup.deleteMany({ where: { tournamentId: tournament.id } });
    for (const g of groups.values()) {
      await tx.golfGroup.create({
        data: {
          tournamentId: tournament.id,
          number: g.number,
          flight: g.flight,
          teeTime: g.teeTime,
          course: g.course,
          marshal: g.marshal,
          players: { connect: g.playerIds.map((id) => ({ id })) },
        },
      });
    }
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "GOLF_DRAW_IMPORT",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} imported the golf Day 1 draw for ${tournament.name} (${groups.size} groups, ${placed.size} players)`,
  });
  refresh(tournament);
  const unplaced = roster.length - placed.size;
  return {
    ok: true,
    summary: `Saved ${groups.size} group${groups.size === 1 ? "" : "s"} with ${placed.size} players.${unplaced > 0 ? ` ${unplaced} roster player${unplaced === 1 ? " isn't" : "s aren't"} in a group.` : ""}`,
  };
}

function parsePoints(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : undefined;
}

// Day 1 scores: school, seed, points. A blank points cell clears that
// player's score; players not in the file are left as they are.
export async function importGolfScoresAction(_prev: GolfImportResult | null, formData: FormData): Promise<GolfImportResult> {
  const admin = await requireAdmin();
  const loaded = await loadGolfTournament(String(formData.get("tournamentId") ?? ""));
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { tournament } = loaded;
  const csv = await readCsv(formData, ["school", "seed", "points"]);
  if (!csv.ok) return { ok: false, error: csv.error };
  const findSchool = await schoolLookup();
  const roster = await prisma.golfPlayer.findMany({ where: { tournamentId: tournament.id }, select: { id: true, schoolId: true, seed: true } });
  const rosterByKey = new Map(roster.map((p) => [`${p.schoolId}:${p.seed}`, p]));

  const rowErrors: RowError[] = [];
  const updates = new Map<string, number | null>();
  for (const { record, row } of csv.records) {
    const school = findSchool(record.school ?? "");
    const seed = parseSeed(record.seed ?? "");
    const points = parsePoints(record.points ?? "");
    if (!school) rowErrors.push({ row, message: `Unknown school "${record.school}".` });
    if (seed === null) rowErrors.push({ row, message: `Seed "${record.seed}" must be a whole number from 1 to ${GOLF_SEEDS_PER_SCHOOL}.` });
    if (points === undefined) rowErrors.push({ row, message: `Points "${record.points}" must be a whole number from 0 to 999.` });
    if (!school || seed === null || points === undefined) continue;
    const player = rosterByKey.get(`${school.id}:${seed}`);
    if (!player) {
      rowErrors.push({ row, message: `No player on the roster for ${record.school} seed ${seed}.` });
      continue;
    }
    if (updates.has(player.id)) {
      rowErrors.push({ row, message: `${record.school} seed ${seed} appears more than once.` });
      continue;
    }
    updates.set(player.id, points);
  }
  if (rowErrors.length > 0) return failed(rowErrors);

  await prisma.$transaction([...updates].map(([id, points]) => prisma.golfPlayer.update({ where: { id }, data: { points } })));

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "GOLF_SCORES_IMPORT",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} imported ${updates.size} golf Day 1 score(s) for ${tournament.name}`,
  });
  refresh(tournament);
  return { ok: true, summary: `Saved ${updates.size} score${updates.size === 1 ? "" : "s"}.` };
}

// The dashboard's per-group form: one points box per player in the group.
export async function saveGolfGroupScoresAction(_prev: GolfImportResult | null, formData: FormData): Promise<GolfImportResult> {
  const admin = await requireAdmin();
  const group = await prisma.golfGroup.findUnique({
    where: { id: String(formData.get("groupId") ?? "") },
    include: { players: { select: { id: true, name: true } }, tournament: { include: { activity: true } } },
  });
  if (!group) return { ok: false, error: "Group not found." };

  const updates: { id: string; points: number | null }[] = [];
  for (const player of group.players) {
    const points = parsePoints(String(formData.get(`points-${player.id}`) ?? ""));
    if (points === undefined) return { ok: false, error: `${player.name}'s points must be a whole number from 0 to 999.` };
    updates.push({ id: player.id, points });
  }
  await prisma.$transaction(updates.map((u) => prisma.golfPlayer.update({ where: { id: u.id }, data: { points: u.points } })));

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "GOLF_GROUP_SCORES",
    entityType: "GolfGroup",
    entityId: group.id,
    summary: `${admin.name} saved Group ${group.number}'s Day 1 scores for ${group.tournament.name}`,
  });
  refresh(group.tournament);
  return { ok: true, summary: "Saved." };
}
