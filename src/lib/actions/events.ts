"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  eventInputSchema,
  resultEntrySchema,
  individualResultEntrySchema,
  setScoreEntrySchema,
  streamUrlSchema,
} from "@/lib/validation";
import { parseCsv } from "@/lib/csv";
import { computeOutcomes, resolvePlayoffSlots, tryFillFromExistingSource } from "@/lib/playoffs";
import type { ActionResult } from "@/lib/actions/auth";
import { z } from "zod";

async function makeUniqueEventSlug(tournamentId: string, date: Date, schoolSlugs: string[]) {
  const base = [date.toISOString().slice(0, 10), ...schoolSlugs].join("-").slice(0, 90);
  let slug = base;
  let suffix = 1;
  while (await prisma.event.findUnique({ where: { tournamentId_slug: { tournamentId, slug } } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export async function createEventAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = eventInputSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    divisionId: formData.get("divisionId") || null,
    title: formData.get("title") ?? "",
    date: formData.get("date"),
    location: formData.get("location") ?? "",
    status: formData.get("status") || "SCHEDULED",
    streamUrl: formData.get("streamUrl") ?? "",
    schoolIds: formData.getAll("schoolIds"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: parsed.data.tournamentId }, include: { activity: true } });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  if (parsed.data.divisionId) {
    const division = await prisma.division.findUnique({ where: { id: parsed.data.divisionId } });
    if (!division || division.activityId !== tournament.activityId) {
      return { ok: false, error: "That division doesn't belong to this activity." };
    }
  }

  const schools = await prisma.school.findMany({ where: { id: { in: parsed.data.schoolIds } } });
  if (schools.length !== parsed.data.schoolIds.length) {
    return { ok: false, error: "One or more selected schools could not be found." };
  }

  const slug = await makeUniqueEventSlug(
    tournament.id,
    parsed.data.date,
    schools.map((s) => s.slug)
  );

  const event = await prisma.event.create({
    data: {
      tournamentId: tournament.id,
      divisionId: parsed.data.divisionId || null,
      slug,
      title: parsed.data.title || null,
      date: parsed.data.date,
      location: parsed.data.location || null,
      status: parsed.data.status,
      streamUrl: parsed.data.streamUrl || null,
      participants: { create: schools.map((s, i) => ({ schoolId: s.id, isHome: i === 0 })) },
      results: { create: schools.map((s) => ({ schoolId: s.id })) },
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "EVENT_CREATE",
    entityType: "Event",
    entityId: event.id,
    summary: `${admin.name} created an event on ${parsed.data.date.toDateString()} for ${schools
      .map((s) => s.name)
      .join(" vs ")}`,
    after: { date: event.date, location: event.location, schoolIds: parsed.data.schoolIds },
  });

  revalidatePath(`/seasons/${tournament.slug}`);
  revalidatePath(`/tournaments/${tournament.activity.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export type ImportEventsResult =
  | { ok: true; created: number; updated: number; removed: number }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

const STATUS_VALUES = new Set(["SCHEDULED", "COMPLETED", "CANCELLED"]);
const REQUIRED_HEADERS = ["date", "home", "away"];

type SideSpec =
  | { kind: "school"; schoolId: string }
  | { kind: "placeholder"; outcome: "WINNER" | "LOSER"; refGameId: string };

type PlannedRow = {
  rowNum: number;
  gameId: string | null;
  date: Date;
  divisionId: string | null;
  title: string | null;
  location: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  streamUrl: string | null;
  home: SideSpec;
  away: SideSpec;
  homeScore: number | null;
  awayScore: number | null;
  fieldValues: { fieldId: string; value: string }[];
};

function parseSide(raw: string, schoolByKey: Map<string, { id: string }>): SideSpec | { error: string } {
  const placeholder = raw.match(/^(winner|loser)\s*\(\s*([^)]+?)\s*\)$/i);
  if (placeholder) {
    return { kind: "placeholder", outcome: placeholder[1].toUpperCase() as "WINNER" | "LOSER", refGameId: placeholder[2].trim() };
  }
  const school = schoolByKey.get(raw.toLowerCase());
  if (!school) return { error: `Unknown school "${raw}".` };
  return { kind: "school", schoolId: school.id };
}

function parseScore(raw: string): number | null | { error: true } {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 9999) return { error: true };
  return n;
}

// Bulk-creates (or, matched by game_id, updates) the events for one weekend
// tournament from a CSV export - 50+ games at once, rather than one form
// submission per game. Every row is validated before anything is written -
// either the whole file goes in or none of it does, so a typo in row 40
// can't leave a half-imported schedule for the admin to untangle by hand.
//
// A home/away cell can also be a playoff placeholder - "WINNER(G3)" or
// "LOSER(G3)" - referencing another row's game_id (from earlier in this same
// file, or already in the schedule). That side is left unfilled until G3 is
// scored, at which point resolvePlayoffSlots() fills it in automatically -
// from this same import if G3 already has a result, or from a later one
// when its score comes in.
export async function importEventsAction(_prevState: ImportEventsResult | null, formData: FormData): Promise<ImportEventsResult> {
  const admin = await requireAdmin();

  const tournamentId = formData.get("tournamentId");
  if (typeof tournamentId !== "string" || !tournamentId) {
    return { ok: false, error: "Choose a tournament first." };
  }
  const replaceExisting = formData.get("replaceExisting") === "on";

  const file = formData.get("csvFile");
  const pastedText = formData.get("csvText");
  const text = file instanceof File && file.size > 0 ? await file.text() : typeof pastedText === "string" ? pastedText : "";
  if (!text.trim()) {
    return { ok: false, error: "Upload a .csv file or paste CSV text." };
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: { include: { divisions: true, fields: { orderBy: { order: "asc" } } } } },
  });
  if (!tournament) return { ok: false, error: "Tournament not found." };
  const scoringType = tournament.activity.scoringType;

  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { ok: false, error: "The file needs a header row plus at least one game row." };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (REQUIRED_HEADERS.some((h) => !header.includes(h))) {
    return {
      ok: false,
      error:
        "The header row needs at least: date, home, away (plus optional game_id, gender, home_score, away_score, time, court, status, streaming_link, and any custom fields for this activity).",
    };
  }
  const col = (name: string) => header.indexOf(name);

  const schools = await prisma.school.findMany();
  const schoolByKey = new Map<string, (typeof schools)[number]>();
  for (const s of schools) {
    schoolByKey.set(s.name.trim().toLowerCase(), s);
    if (s.code) schoolByKey.set(s.code.trim().toLowerCase(), s);
  }
  const divisionByName = new Map(tournament.activity.divisions.map((d) => [d.name.trim().toLowerCase(), d]));
  const requiresDivision = tournament.activity.divisions.length > 0;
  const activityFields = tournament.activity.fields;

  const existingEvents = await prisma.event.findMany({
    where: { tournamentId: tournament.id, externalId: { not: null } },
    include: { participants: true },
  });
  const existingByGameId = new Map(existingEvents.map((e) => [e.externalId!, e]));
  const knownGameIds = new Set(existingByGameId.keys());
  const fileGameIdRows = new Map<string, number>();

  const rowErrors: { row: number; message: string }[] = [];
  const planned: PlannedRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((c) => c.trim() === "")) continue;
    const rowNum = i + 1;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
    let rowFailed = false;
    const fail = (message: string) => {
      rowErrors.push({ row: rowNum, message });
      rowFailed = true;
    };

    const gameId = get("game_id") || null;
    if (gameId && fileGameIdRows.has(gameId)) {
      fail(`game_id "${gameId}" is used more than once in this file (already used in row ${fileGameIdRows.get(gameId)}).`);
    }

    const dateRaw = get("date");
    const timeRaw = get("time") || "09:00";
    let date = new Date(NaN);
    if (!dateRaw) {
      fail("Missing date.");
    } else {
      date = new Date(`${dateRaw}T${timeRaw.length === 5 ? timeRaw : timeRaw.padStart(5, "0")}:00`);
      if (Number.isNaN(date.getTime())) {
        fail(`Could not parse date/time "${dateRaw} ${timeRaw}" (use YYYY-MM-DD and HH:MM).`);
      }
    }

    let divisionId: string | null = null;
    const genderRaw = get("gender");
    if (genderRaw) {
      const division = divisionByName.get(genderRaw.toLowerCase());
      if (!division) fail(`Unknown gender "${genderRaw}".`);
      else divisionId = division.id;
    } else if (requiresDivision) {
      fail("This tournament has divisions. Set the gender column.");
    }

    const homeRaw = get("home");
    const awayRaw = get("away");
    let home: SideSpec | null = null;
    let away: SideSpec | null = null;
    if (!homeRaw) fail("Missing home.");
    else {
      const parsed = parseSide(homeRaw, schoolByKey);
      if ("error" in parsed) fail(parsed.error);
      else home = parsed;
    }
    if (!awayRaw) fail("Missing away.");
    else {
      const parsed = parseSide(awayRaw, schoolByKey);
      if ("error" in parsed) fail(parsed.error);
      else away = parsed;
    }
    for (const side of [home, away]) {
      if (side?.kind === "placeholder" && !knownGameIds.has(side.refGameId)) {
        fail(`References unknown game_id "${side.refGameId}" (it must appear in an earlier row, or already exist in this season).`);
      }
    }
    if (home && away && home.kind === "school" && away.kind === "school" && home.schoolId === away.schoolId) {
      fail("Home and away must be different schools.");
    }

    const statusRaw = (get("status") || "SCHEDULED").toUpperCase();
    if (!STATUS_VALUES.has(statusRaw)) {
      fail(`Invalid status "${statusRaw}" (use SCHEDULED, COMPLETED, or CANCELLED).`);
    }

    const streamUrlRaw = get("streaming_link");
    if (streamUrlRaw && !/^https?:\/\//i.test(streamUrlRaw)) {
      fail(`Stream link "${streamUrlRaw}" must start with http:// or https://.`);
    }

    const homeScoreRaw = get("home_score");
    const awayScoreRaw = get("away_score");
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    if (scoringType === "NONE") {
      if (homeScoreRaw || awayScoreRaw) fail("This tournament doesn't use scores. Leave home_score and away_score blank.");
    } else {
      const parsedHome = parseScore(homeScoreRaw);
      if (parsedHome && typeof parsedHome === "object") fail(`home_score "${homeScoreRaw}" must be a whole number 0-9999.`);
      else homeScore = parsedHome;
      const parsedAway = parseScore(awayScoreRaw);
      if (parsedAway && typeof parsedAway === "object") fail(`away_score "${awayScoreRaw}" must be a whole number 0-9999.`);
      else awayScore = parsedAway;
    }

    const fieldValues: PlannedRow["fieldValues"] = [];
    for (const field of activityFields) {
      const raw = get(field.key);
      if (raw) fieldValues.push({ fieldId: field.id, value: raw.slice(0, 500) });
    }

    if (rowFailed) continue;

    if (gameId) {
      fileGameIdRows.set(gameId, rowNum);
      knownGameIds.add(gameId);
    }
    planned.push({
      rowNum,
      gameId,
      date,
      divisionId,
      title: get("title") || null,
      location: get("court") || null,
      status: statusRaw as PlannedRow["status"],
      streamUrl: streamUrlRaw || null,
      home: home!,
      away: away!,
      homeScore,
      awayScore,
      fieldValues,
    });
  }

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is imported.`, rowErrors };
  }
  if (planned.length === 0) {
    return { ok: false, error: "No game rows found in the file." };
  }

  const schoolSlugById = new Map(schools.map((s) => [s.id, s.slug]));

  type ResolvedSide =
    | { participantAction: "none" }
    | { participantAction: "create" | "replace"; schoolId: string }
    | { participantAction: "pending"; sourceEventId: string; outcome: "WINNER" | "LOSER" };

  const { createdIds, updatedIds, removedIds } = await prisma.$transaction(
    async (tx) => {
      const claimedSlugs = new Set<string>();
      const gameIdToEventId = new Map(Array.from(existingByGameId.entries()).map(([gid, e]) => [gid, e.id]));
      const createdIds: string[] = [];
      const updatedIds: string[] = [];

      function resolveSide(spec: SideSpec, existingParticipant: { schoolId: string } | null): ResolvedSide {
        if (spec.kind === "school") {
          if (!existingParticipant) return { participantAction: "create", schoolId: spec.schoolId };
          if (existingParticipant.schoolId === spec.schoolId) return { participantAction: "none" };
          return { participantAction: "replace", schoolId: spec.schoolId };
        }
        if (existingParticipant) return { participantAction: "none" };
        return { participantAction: "pending", sourceEventId: gameIdToEventId.get(spec.refGameId)!, outcome: spec.outcome };
      }

      async function applyParticipant(eventId: string, isHome: boolean, resolved: ResolvedSide, existingParticipant: { schoolId: string } | null) {
        if (resolved.participantAction === "none" || resolved.participantAction === "pending") return;
        if (resolved.participantAction === "replace" && existingParticipant) {
          await tx.result.deleteMany({ where: { eventId, schoolId: existingParticipant.schoolId } });
          await tx.eventParticipant.deleteMany({ where: { eventId, isHome } });
        }
        await tx.eventParticipant.create({ data: { eventId, schoolId: resolved.schoolId, isHome } });
        await tx.result.upsert({
          where: { eventId_schoolId: { eventId, schoolId: resolved.schoolId } },
          create: { eventId, schoolId: resolved.schoolId },
          update: {},
        });
      }

      function currentSchoolId(resolved: ResolvedSide, existingParticipant: { schoolId: string } | null): string | null {
        if (resolved.participantAction === "pending") return null;
        if (resolved.participantAction === "none") return existingParticipant?.schoolId ?? null;
        return resolved.schoolId;
      }

      function sourceFieldsFor(resolved: ResolvedSide) {
        if (resolved.participantAction === "pending") return { eventId: resolved.sourceEventId, outcome: resolved.outcome };
        if (resolved.participantAction === "create" || resolved.participantAction === "replace") return { eventId: null, outcome: null };
        return undefined; // "none" - leave whatever was already stored
      }

      for (const row of planned) {
        const existing = row.gameId ? existingByGameId.get(row.gameId) : undefined;
        const existingHome = existing?.participants.find((p) => p.isHome) ?? null;
        const existingAway = existing?.participants.find((p) => !p.isHome) ?? null;

        const homeResolved = resolveSide(row.home, existingHome);
        const awayResolved = resolveSide(row.away, existingAway);
        const homeSource = sourceFieldsFor(homeResolved);
        const awaySource = sourceFieldsFor(awayResolved);

        let eventId: string;
        if (existing) {
          await tx.event.update({
            where: { id: existing.id },
            data: {
              divisionId: row.divisionId,
              title: row.title,
              date: row.date,
              location: row.location,
              status: row.status,
              streamUrl: row.streamUrl,
              ...(homeSource ? { homeSourceEventId: homeSource.eventId, homeSourceOutcome: homeSource.outcome } : {}),
              ...(awaySource ? { awaySourceEventId: awaySource.eventId, awaySourceOutcome: awaySource.outcome } : {}),
            },
          });
          eventId = existing.id;
          updatedIds.push(eventId);
        } else {
          const homeSlugId = currentSchoolId(homeResolved, existingHome);
          const awaySlugId = currentSchoolId(awayResolved, existingAway);
          const base = row.gameId
            ? `game-${row.gameId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "row"}`
            : [
                row.date.toISOString().slice(0, 10),
                homeSlugId ? schoolSlugById.get(homeSlugId) : "tbd",
                awaySlugId ? schoolSlugById.get(awaySlugId) : "tbd",
              ].join("-").slice(0, 90);
          let slug = base;
          let suffix = 1;
          while (claimedSlugs.has(slug) || (await tx.event.findUnique({ where: { tournamentId_slug: { tournamentId: tournament.id, slug } } }))) {
            suffix += 1;
            slug = `${base}-${suffix}`;
          }
          claimedSlugs.add(slug);

          const event = await tx.event.create({
            data: {
              tournamentId: tournament.id,
              divisionId: row.divisionId,
              slug,
              title: row.title,
              date: row.date,
              location: row.location,
              status: row.status,
              streamUrl: row.streamUrl,
              externalId: row.gameId,
              homeSourceEventId: homeSource?.eventId ?? null,
              homeSourceOutcome: homeSource?.outcome ?? null,
              awaySourceEventId: awaySource?.eventId ?? null,
              awaySourceOutcome: awaySource?.outcome ?? null,
            },
          });
          eventId = event.id;
          createdIds.push(eventId);
        }

        await applyParticipant(eventId, true, homeResolved, existingHome);
        await applyParticipant(eventId, false, awayResolved, existingAway);

        const homeSchoolId = currentSchoolId(homeResolved, existingHome);
        const awaySchoolId = currentSchoolId(awayResolved, existingAway);
        if (row.homeScore !== null && homeSchoolId) {
          await tx.result.update({ where: { eventId_schoolId: { eventId, schoolId: homeSchoolId } }, data: { score: row.homeScore } });
        }
        if (row.awayScore !== null && awaySchoolId) {
          await tx.result.update({ where: { eventId_schoolId: { eventId, schoolId: awaySchoolId } }, data: { score: row.awayScore } });
        }
        if (homeSchoolId && awaySchoolId) {
          const [homeResult, awayResult] = await Promise.all([
            tx.result.findUnique({ where: { eventId_schoolId: { eventId, schoolId: homeSchoolId } } }),
            tx.result.findUnique({ where: { eventId_schoolId: { eventId, schoolId: awaySchoolId } } }),
          ]);
          const outcomes = computeOutcomes(scoringType, homeResult?.score ?? null, awayResult?.score ?? null);
          if (outcomes.home) await tx.result.update({ where: { eventId_schoolId: { eventId, schoolId: homeSchoolId } }, data: { outcome: outcomes.home } });
          if (outcomes.away) await tx.result.update({ where: { eventId_schoolId: { eventId, schoolId: awaySchoolId } }, data: { outcome: outcomes.away } });
        }

        for (const fv of row.fieldValues) {
          await tx.eventFieldValue.upsert({
            where: { eventId_fieldId: { eventId, fieldId: fv.fieldId } },
            create: { eventId, fieldId: fv.fieldId, value: fv.value },
            update: { value: fv.value },
          });
        }

        await resolvePlayoffSlots(tx, eventId);
        if (homeResolved.participantAction === "pending") {
          await tryFillFromExistingSource(tx, eventId, true, homeResolved.sourceEventId, homeResolved.outcome);
        }
        if (awayResolved.participantAction === "pending") {
          await tryFillFromExistingSource(tx, eventId, false, awayResolved.sourceEventId, awayResolved.outcome);
        }

        if (row.gameId) gameIdToEventId.set(row.gameId, eventId);
      }

      const removedIds: string[] = [];
      if (replaceExisting) {
        const fileGameIds = new Set(planned.map((r) => r.gameId).filter((id): id is string => id !== null));
        const toRemove = existingEvents.filter((e) => e.externalId && !fileGameIds.has(e.externalId));
        if (toRemove.length > 0) {
          await tx.event.deleteMany({ where: { id: { in: toRemove.map((e) => e.id) } } });
          removedIds.push(...toRemove.map((e) => e.id));
        }
      }

      return { createdIds, updatedIds, removedIds };
    },
    { timeout: 60_000 }
  );

  const allIds = [...createdIds, ...updatedIds];
  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "EVENT_IMPORT",
    entityType: "Event",
    entityId: allIds[0],
    summary: `${admin.name} imported a schedule into ${tournament.activity.name} · ${tournament.name} from a CSV file (${createdIds.length} new, ${updatedIds.length} updated${removedIds.length > 0 ? `, ${removedIds.length} removed` : ""})`,
    after: { tournamentId: tournament.id, created: createdIds.length, updated: updatedIds.length, removed: removedIds.length },
  });

  revalidatePath(`/seasons/${tournament.slug}`);
  revalidatePath(`/tournaments/${tournament.activity.slug}`);
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true, created: createdIds.length, updated: updatedIds.length, removed: removedIds.length };
}

const updateEventSchema = z.object({
  eventId: z.string().cuid(),
  date: z.coerce.date(),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]),
  recap: z.string().trim().max(4000).optional().or(z.literal("")),
  streamUrl: streamUrlSchema,
});

export async function updateEventAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updateEventSchema.safeParse({
    eventId: formData.get("eventId"),
    date: formData.get("date"),
    location: formData.get("location") ?? "",
    status: formData.get("status"),
    recap: formData.get("recap") ?? "",
    streamUrl: formData.get("streamUrl") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId },
    include: { participants: true, results: true, sets: true, tournament: { include: { activity: true } }, division: true },
  });
  if (!event) return { ok: false, error: "Event not found." };

  const participantSchoolIds = event.participants.map((p) => p.schoolId);
  const isAdmin = user.role === "ADMIN";
  const isScopedEditor = user.role === "EDITOR" && !!user.schoolId && participantSchoolIds.includes(user.schoolId);
  if (!isAdmin && !isScopedEditor) {
    return { ok: false, error: "You don't have access to edit this event." };
  }

  const before = {
    date: event.date,
    location: event.location,
    status: event.status,
    recap: event.recap,
    streamUrl: event.streamUrl,
  };
  const after = {
    date: parsed.data.date,
    location: parsed.data.location || null,
    status: parsed.data.status,
    recap: parsed.data.recap || null,
    streamUrl: parsed.data.streamUrl || null,
  };

  await prisma.event.update({ where: { id: event.id }, data: after });

  await recordAudit({
    actorId: user.id,
    actorLabel: user.name,
    action: "EVENT_UPDATE",
    entityType: "Event",
    entityId: event.id,
    schoolId: isScopedEditor ? user.schoolId : null,
    summary: `${user.name} updated event details`,
    before,
    after,
  });

  // Admin-only override of who's on each side of a dual-match event -
  // fixes a mistaken assignment, or manually sets a side ahead of the game
  // it's waiting on (a CSV "WINNER(G3)" playoff reference) actually being
  // decided. Only offered for a 2-sided event (see homeSide/awaySide in the
  // edit page) - a multi-school meet has no single "home"/"away" to swap.
  // Replacing a side always clears its source reference, since a manual
  // pick takes precedence; this does NOT retroactively fix any *downstream*
  // slot that already resolved off this event's old participant - only
  // this event's own two sides.
  if (isAdmin && event.participants.length <= 2) {
    const home = event.participants.find((p) => p.isHome) ?? null;
    const away = event.participants.find((p) => !p.isHome) ?? null;

    const resolveTarget = (raw: FormDataEntryValue | null): string | null | undefined => {
      if (raw === null) return undefined; // field not submitted - leave this side alone
      const value = String(raw);
      if (value === "") return null; // explicitly cleared to "not decided yet"
      return z.string().cuid().safeParse(value).success ? value : undefined; // malformed - ignore
    };

    const homeTarget = resolveTarget(formData.get("home-schoolId"));
    const awayTarget = resolveTarget(formData.get("away-schoolId"));

    const idsToValidate = [homeTarget, awayTarget].filter((v): v is string => typeof v === "string");
    const validSchoolIds = new Set(
      idsToValidate.length ? (await prisma.school.findMany({ where: { id: { in: idsToValidate } } })).map((s) => s.id) : []
    );

    // A stale/tampered submission putting the same school on both sides -
    // skip the whole reassignment rather than create an invalid matchup.
    const conflict = homeTarget && awayTarget && homeTarget === awayTarget;

    if (!conflict) {
      const sides = [
        { key: "home" as const, isHome: true, current: home, target: homeTarget },
        { key: "away" as const, isHome: false, current: away, target: awayTarget },
      ];
      for (const side of sides) {
        if (side.target === undefined) continue;
        if (side.target !== null && !validSchoolIds.has(side.target)) continue;
        const currentSchoolId = side.current?.schoolId ?? null;
        if (side.target === currentSchoolId) continue;

        await prisma.$transaction([
          ...(currentSchoolId
            ? [
                prisma.result.deleteMany({ where: { eventId: event.id, schoolId: currentSchoolId } }),
                prisma.eventParticipant.deleteMany({ where: { eventId: event.id, isHome: side.isHome } }),
              ]
            : []),
          ...(side.target
            ? [
                prisma.eventParticipant.create({ data: { eventId: event.id, schoolId: side.target, isHome: side.isHome } }),
                prisma.result.upsert({
                  where: { eventId_schoolId: { eventId: event.id, schoolId: side.target } },
                  create: { eventId: event.id, schoolId: side.target },
                  update: {},
                }),
              ]
            : []),
          prisma.event.update({
            where: { id: event.id },
            data: side.isHome
              ? { homeSourceEventId: null, homeSourceOutcome: null }
              : { awaySourceEventId: null, awaySourceOutcome: null },
          }),
        ]);

        await recordAudit({
          actorId: user.id,
          actorLabel: user.name,
          action: "EVENT_PARTICIPANT_CHANGE",
          entityType: "EventParticipant",
          entityId: event.id,
          summary: `${user.name} changed the ${side.key} side of this event`,
          before: { schoolId: currentSchoolId },
          after: { schoolId: side.target },
        });
      }
    }
  }

  // The participant list above may have just changed - re-read it so the
  // result/individual-score loops below only touch schools actually still
  // on this event, instead of the stale list from before this submission
  // (which would otherwise recreate a Result row for a school that was
  // just removed, since its score/outcome fields are still present in
  // this same form submission).
  const currentParticipantSchoolIds = (await prisma.eventParticipant.findMany({ where: { eventId: event.id } })).map(
    (p) => p.schoolId
  );

  // Each participating school's result row is only touched if this
  // submission actually included fields for it: admins always include every
  // school; a school editor's form only renders their own school's fields,
  // and any other `result-<schoolId>-*` field is ignored server-side even if
  // present in the raw POST body, so a school can never overwrite another
  // school's result by tampering with the form.
  for (const schoolId of currentParticipantSchoolIds) {
    if (!isAdmin && schoolId !== user.schoolId) continue;

    const scoreRaw = formData.get(`result-${schoolId}-score`);
    const outcomeRaw = formData.get(`result-${schoolId}-outcome`);
    if (scoreRaw === null && outcomeRaw === null) continue;

    const resultParsed = resultEntrySchema.safeParse({
      schoolId,
      score: scoreRaw ?? "",
      outcome: outcomeRaw ?? "",
    });
    if (!resultParsed.success) continue;

    const existing = event.results.find((r) => r.schoolId === schoolId);
    const resultBefore = existing ? { score: existing.score, outcome: existing.outcome } : null;
    const resultAfter = { score: resultParsed.data.score, outcome: resultParsed.data.outcome };

    const saved = await prisma.result.upsert({
      where: { eventId_schoolId: { eventId: event.id, schoolId } },
      create: { eventId: event.id, schoolId, ...resultAfter },
      update: resultAfter,
    });

    await recordAudit({
      actorId: user.id,
      actorLabel: user.name,
      action: "RESULT_UPDATE",
      entityType: "Result",
      entityId: saved.id,
      schoolId,
      summary: `${user.name} updated the result for a school in this event`,
      before: resultBefore,
      after: resultAfter,
    });
  }

  // Per-set scores, for volleyball-style (usesSetScores) activities - a
  // match-wide sheet rather than school-scoped, so anyone with edit access
  // to this event (admin or either participating school) can enter it.
  // The "present" marker distinguishes "not rendered for this event" from
  // "submitted as an empty list" (clear all sets), same as individual scores.
  if (event.tournament.activity.usesSetScores && formData.get("sets-present") !== null) {
    const homeScores = formData.getAll("set-home-score").map(String);
    const awayScores = formData.getAll("set-away-score").map(String);
    const newSets: { setNumber: number; homeScore: number; awayScore: number }[] = [];
    for (let i = 0; i < homeScores.length; i++) {
      const setParsed = setScoreEntrySchema.safeParse({
        setNumber: i + 1,
        homeScore: homeScores[i],
        awayScore: awayScores[i],
      });
      if (setParsed.success) newSets.push(setParsed.data);
    }

    const setsBefore = event.sets.map((s) => ({ setNumber: s.setNumber, homeScore: s.homeScore, awayScore: s.awayScore }));
    if (setsBefore.length > 0 || newSets.length > 0) {
      await prisma.$transaction([
        prisma.eventSet.deleteMany({ where: { eventId: event.id } }),
        ...(newSets.length > 0
          ? [prisma.eventSet.createMany({ data: newSets.map((s) => ({ eventId: event.id, ...s })) })]
          : []),
      ]);

      await recordAudit({
        actorId: user.id,
        actorLabel: user.name,
        action: "EVENT_SETS_UPDATE",
        entityType: "EventSet",
        entityId: event.id,
        schoolId: isScopedEditor ? user.schoolId : null,
        summary: `${user.name} updated set scores for this event`,
        before: { sets: setsBefore },
        after: { sets: newSets },
      });
    }
  }

  // This game might now be decided - fill in any playoff slot waiting on
  // its winner/loser ("winner of this game plays...").
  await resolvePlayoffSlots(prisma, event.id);

  // Individual (per-athlete) scores, for LOW_SCORE activities like golf. The
  // "present" marker distinguishes "no rows submitted for this school"
  // (field not rendered - skip) from "submitted as an empty list" (clear
  // all rows) - same school-scoping rule as team results above.
  for (const schoolId of currentParticipantSchoolIds) {
    if (!isAdmin && schoolId !== user.schoolId) continue;
    if (formData.get(`individual-${schoolId}-present`) === null) continue;

    const names = formData.getAll(`individual-${schoolId}-name`).map(String);
    const scores = formData.getAll(`individual-${schoolId}-score`).map(String);
    const newEntries: { athleteName: string; score: number }[] = [];
    for (let i = 0; i < names.length; i++) {
      const parsed = individualResultEntrySchema.safeParse({ athleteName: names[i], score: scores[i] });
      if (parsed.success) newEntries.push(parsed.data);
    }

    const existingIndividuals = await prisma.individualResult.findMany({
      where: { eventId: event.id, schoolId },
    });
    const individualBefore = existingIndividuals.map((e) => ({ athleteName: e.athleteName, score: e.score }));
    if (individualBefore.length === 0 && newEntries.length === 0) continue;

    await prisma.$transaction([
      prisma.individualResult.deleteMany({ where: { eventId: event.id, schoolId } }),
      ...(newEntries.length > 0
        ? [
            prisma.individualResult.createMany({
              data: newEntries.map((e) => ({ eventId: event.id, schoolId, ...e })),
            }),
          ]
        : []),
    ]);

    await recordAudit({
      actorId: user.id,
      actorLabel: user.name,
      action: "INDIVIDUAL_RESULTS_UPDATE",
      entityType: "IndividualResults",
      entityId: event.id,
      schoolId,
      summary: `${user.name} updated individual scores for a school in this event`,
      before: { entries: individualBefore },
      after: { entries: newEntries },
    });
  }

  revalidatePath(`/seasons/${event.tournament.slug}`);
  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  if (event.division) {
    revalidatePath(`/seasons/${event.tournament.slug}/${event.division.slug}/schedule`);
    revalidatePath(`/seasons/${event.tournament.slug}/${event.division.slug}/results`);
  }
  revalidatePath(`/tournaments/${event.tournament.activity.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function revertAuditEntryAction(auditLogId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const entry = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!entry || entry.beforeJson === null || entry.beforeJson === undefined) {
    return { ok: false, error: "Nothing to revert for this entry." };
  }

  if (entry.entityType === "Event") {
    const before = entry.beforeJson as { date?: string; location?: string | null; status?: string; recap?: string | null };
    const event = await prisma.event.findUnique({ where: { id: entry.entityId } });
    if (!event) return { ok: false, error: "Event no longer exists." };
    const current = { date: event.date, location: event.location, status: event.status, recap: event.recap };
    await prisma.event.update({
      where: { id: event.id },
      data: {
        date: before.date ? new Date(before.date) : event.date,
        location: before.location ?? null,
        status: (before.status as typeof event.status) ?? event.status,
        recap: before.recap ?? null,
      },
    });
    await recordAudit({
      actorId: admin.id,
      actorLabel: admin.name,
      action: "EVENT_REVERT",
      entityType: "Event",
      entityId: event.id,
      summary: `${admin.name} reverted event details to an earlier version`,
      before: current,
      after: before,
    });
  } else if (entry.entityType === "Result") {
    const before = entry.beforeJson as { score?: number | null; outcome?: string | null };
    const result = await prisma.result.findUnique({ where: { id: entry.entityId } });
    if (!result) return { ok: false, error: "Result no longer exists." };
    const current = { score: result.score, outcome: result.outcome };
    await prisma.result.update({
      where: { id: result.id },
      data: { score: before.score ?? null, outcome: (before.outcome as typeof result.outcome) ?? null },
    });
    await recordAudit({
      actorId: admin.id,
      actorLabel: admin.name,
      action: "RESULT_REVERT",
      entityType: "Result",
      entityId: result.id,
      schoolId: result.schoolId,
      summary: `${admin.name} reverted a result to an earlier version`,
      before: current,
      after: before,
    });
  } else {
    return { ok: false, error: "This type of change can't be reverted automatically." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
