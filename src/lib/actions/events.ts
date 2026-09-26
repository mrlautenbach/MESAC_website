"use server";

import { revalidatePath } from "next/cache";
import { revalidateTournament } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { ensureInRoster } from "@/lib/tournamentRoster";
import { requireAdmin, requireUser } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import {
  eventInputSchema,
  resultEntrySchema,
  individualResultEntrySchema,
  setScoreEntrySchema,
  streamUrlSchema,
} from "@/lib/validation";
import { parseCsv, readCsvUpload } from "@/lib/csv";
import { findDivision } from "@/lib/divisionAlias";
import { createGuestSchools } from "@/lib/newSchools";
import { gameNumberOf } from "@/lib/eventOrder";
import { computeOutcomes, resolvePlayoffSlots, resolveStandingSlots, tryFillFromExistingSource } from "@/lib/playoffs";
import type { ActionResult } from "@/lib/actions/auth";
import { z } from "zod";
import { deleteStoredFiles, storedFilesFor } from "@/lib/storedFiles";
import { slugify } from "@/lib/slug";
import { loadSchoolKeys } from "@/lib/schoolKeys";

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
  const admin = await requireUser();

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
    if (!division || division.tournamentId !== tournament.id) {
      return { ok: false, error: "That division doesn't belong to this tournament." };
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

  // Putting a school in a game is the clearest statement that it's taking
  // part, so it wins over a roster that was ticked before the fixture existed.
  await ensureInRoster(prisma, tournament.id, schools.map((s) => s.id));

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

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard");
  return { ok: true };
}

export type ImportEventsResult =
  | { ok: true; created: number; updated: number; removed: number; newSchools: string[] }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

const STATUS_VALUES = new Set(["SCHEDULED", "COMPLETED", "CANCELLED"]);
const REQUIRED_HEADERS = ["date", "home", "away"];

type SideSpec =
  | { kind: "school"; schoolId: string }
  | { kind: "placeholder"; outcome: "WINNER" | "LOSER"; refGameId: string }
  // Seeded by a final-standings position within this row's own division
  // ("1st", "4th", ...) - see resolveStandingSlots.
  | { kind: "standing"; position: number }
  // A free-text placeholder for an opponent not yet in the database
  // ("TBD(Local)"), or a bare "TBD" for no particular label - filled in by
  // hand later, same as overriding an unresolved game-outcome slot.
  | { kind: "label"; text: string | null }
  // A school not in the database yet, added as a guest school when the
  // import is allowed to (see createGuestSchools).
  | { kind: "newSchool"; name: string };

type PlannedRow = {
  rowNum: number;
  gameId: string | null;
  date: Date;
  divisionId: string | null;
  title: string | null;
  location: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  streamUrl: string | null;
  order: number | null;
  home: SideSpec | null;
  away: SideSpec | null;
  homeScore: number | null;
  awayScore: number | null;
  // null means this row's cell for that field is blank - clears any
  // existing value, same as leaving location/streamUrl/order blank does.
  fieldValues: { fieldId: string; value: string | null }[];
};

function parseSide(
  raw: string,
  schoolByKey: Map<string, { id: string }>,
  knownGameIds: Set<string>,
  allowNewSchools: boolean
): SideSpec | { error: string } {
  // A real school name or code always wins, so a code that happens to start
  // with W or L ("WAB", "Local") is never read as a winner/loser slot.
  const school = schoolByKey.get(raw.toLowerCase());
  if (school) return { kind: "school", schoolId: school.id };

  // "WINNER(G3)"/"LOSER(G3)" (original syntax) plus the more conversational
  // "W of G3", "Winner of G3", "L G3", "Loser of G3" - all case-insensitive.
  // The word and the game id must be separated by a space, "of" or
  // parentheses; the run-together form ("WG3") is only accepted when the rest
  // is a game_id that actually exists.
  const separated =
    raw.match(/^(winner|win|w|loser|lose|loss|l)\s*\(\s*([a-z0-9._-]+)\s*\)$/i) ??
    raw.match(/^(winner|win|w|loser|lose|loss|l)\s+(?:of\s+)?([a-z0-9._-]+)$/i);
  const joined = raw.match(/^(w|l)([a-z0-9._-]+)$/i);
  const placeholder = separated ?? (joined && knownGameIds.has(joined[2]) ? joined : null);
  if (placeholder) {
    const outcome: "WINNER" | "LOSER" = /^w/i.test(placeholder[1]) ? "WINNER" : "LOSER";
    return { kind: "placeholder", outcome, refGameId: placeholder[2] };
  }

  // A placement-bracket seed: "1st", "2nd", "3rd", "4th", ... (an optional
  // trailing "place" is fine too, e.g. "4th Place") - this row's own
  // division's final standings, once every group-stage game in it is
  // decided (see resolveStandingSlots).
  const ordinal = raw.match(/^(\d+)(?:st|nd|rd|th)(?:\s+place)?$/i);
  if (ordinal) {
    const position = Number(ordinal[1]);
    if (position < 1) return { error: `Invalid standing "${raw}" (use 1st, 2nd, 3rd, and so on).` };
    return { kind: "standing", position };
  }

  // A named or bare placeholder for an opponent not yet in the database -
  // filled in by hand later from this event's own "Change who's playing".
  const tbd = raw.match(/^tbd(?:\s*\(\s*(.+?)\s*\))?$/i);
  if (tbd) return { kind: "label", text: tbd[1]?.trim() || null };

  if (allowNewSchools) return { kind: "newSchool", name: raw };
  return { error: `Unknown school "${raw}".` };
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
  const admin = await requireUser();

  const tournamentId = formData.get("tournamentId");
  if (typeof tournamentId !== "string" || !tournamentId) {
    return { ok: false, error: "Choose a tournament first." };
  }
  const replaceExisting = formData.get("replaceExisting") === "on";
  // Only admins can add schools, same as the Schools page.
  const addNewSchools = formData.get("addNewSchools") === "on" && admin.role === "ADMIN";

  const text = await readCsvUpload(formData);
  if (!text.trim()) {
    return { ok: false, error: "Upload a .csv file or paste CSV text." };
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: { include: { fields: { orderBy: { order: "asc" } } } }, divisions: true },
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
        "The header row needs at least: date, home, away (plus optional game_id, gender, home_score, away_score, time, court, status, streaming_link, order, and any custom fields for this activity).",
    };
  }
  const col = (name: string) => header.indexOf(name);

  const { schools, byKey: schoolByKey } = await loadSchoolKeys();
  const requiresDivision = tournament.divisions.length > 0;
  const divisionNames = tournament.divisions.map((d) => d.name).join(", ");
  // Said once for the whole file rather than on every row.
  if (!requiresDivision && col("gender") >= 0 && rows.slice(1).some((r) => (r[col("gender")] ?? "").trim())) {
    return {
      ok: false,
      error: `${tournament.activity.name} · ${tournament.name} has no divisions set up, so the gender column can't be matched. Add them (e.g. Girls and Boys) under Divisions on the activity's Tournaments page, then upload again - or leave the gender column blank.`,
    };
  }
  const activityFields = tournament.activity.fields;

  const existingEvents = await prisma.event.findMany({
    where: { tournamentId: tournament.id, externalId: { not: null } },
    include: { participants: true, results: true },
  });
  const existingByGameId = new Map(existingEvents.map((e) => [e.externalId!, e]));
  const knownGameIds = new Set(existingByGameId.keys());
  const fileGameIdRows = new Map<string, number>();
  // game_ids of rows that failed: a later "Winner of G21" pointing at one of
  // them isn't reported again as an unknown game - fixing G21's row fixes it.
  const failedGameIds = new Set<string>();

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
      const division = findDivision(tournament.divisions, genderRaw);
      if (!division) fail(`Unknown gender "${genderRaw}" (this tournament's divisions are ${divisionNames}).`);
      else divisionId = division.id;
    } else if (requiresDivision) {
      fail("This tournament has divisions. Set the gender column.");
    }

    const homeRaw = get("home");
    const awayRaw = get("away");
    let home: SideSpec | null = null;
    let away: SideSpec | null = null;
    if (!homeRaw) {
      fail("Missing home.");
    } else {
      const parsed = parseSide(homeRaw, schoolByKey, knownGameIds, addNewSchools);
      if ("error" in parsed) fail(parsed.error);
      else home = parsed;
    }
    if (!awayRaw) {
      fail("Missing away.");
    } else {
      const parsed = parseSide(awayRaw, schoolByKey, knownGameIds, addNewSchools);
      if ("error" in parsed) fail(parsed.error);
      else away = parsed;
    }
    for (const side of [home, away]) {
      if (side?.kind === "placeholder" && !knownGameIds.has(side.refGameId) && !failedGameIds.has(side.refGameId)) {
        fail(`References unknown game_id "${side.refGameId}" (it must appear in an earlier row, or already exist in this season).`);
      }
    }
    const sideKey = (side: SideSpec | null) =>
      side?.kind === "school" ? side.schoolId : side?.kind === "newSchool" ? `new:${side.name.toLowerCase()}` : null;
    if (sideKey(home) && sideKey(home) === sideKey(away)) {
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

    // Overrides the default date-based sort on schedule/results listings -
    // useful when several same-day games need a specific reading order.
    // Blank keeps the date sort.
    const orderRaw = get("order");
    let order: number | null = null;
    if (orderRaw) {
      const n = Number(orderRaw);
      if (!Number.isInteger(n)) fail(`order "${orderRaw}" must be a whole number.`);
      else order = n;
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
      fieldValues.push({ fieldId: field.id, value: raw ? raw.slice(0, 500) : null });
    }

    if (rowFailed) {
      if (gameId) failedGameIds.add(gameId);
      continue;
    }

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
      order,
      home,
      away,
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
  // Every slug already taken in this tournament, read once rather than
  // checked row by row inside the transaction.
  const takenSlugs = new Set(
    (await prisma.event.findMany({ where: { tournamentId: tournament.id }, select: { slug: true } })).map((e) => e.slug)
  );
  // The games another game is waiting on ("winner of G3 plays..."): only
  // their rows need the bracket worked out again. Rows in this file that
  // point at a game add it as they're written.
  const existingIds = existingEvents.map((e) => e.id);
  const feedsBracket = new Set(
    (
      await prisma.event.findMany({
        where: { OR: [{ homeSourceEventId: { in: existingIds } }, { awaySourceEventId: { in: existingIds } }] },
        select: { homeSourceEventId: true, awaySourceEventId: true },
      })
    ).flatMap((e) => [e.homeSourceEventId, e.awaySourceEventId].filter((id): id is string => id !== null))
  );

  type ResolvedSide =
    | { participantAction: "none" }
    | { participantAction: "clear" }
    | { participantAction: "create" | "replace"; schoolId: string }
    | { participantAction: "pending"; sourceEventId: string; outcome: "WINNER" | "LOSER" }
    | { participantAction: "pending-standing"; position: number }
    | { participantAction: "pending-label"; text: string | null };

  const { createdIds, updatedIds, removedIds, removedFiles, newSchoolNames } = await prisma.$transaction(
    async (tx) => {
      const gameIdToEventId = new Map(Array.from(existingByGameId.entries()).map(([gid, e]) => [gid, e.id]));
      const createdIds: string[] = [];
      const updatedIds: string[] = [];

      // Add any schools the file names that aren't in the database yet, then
      // point those rows at the new school like any other.
      const newSchoolNames = planned.flatMap((row) =>
        [row.home, row.away].flatMap((side) => (side?.kind === "newSchool" ? [side.name] : []))
      );
      const newSchools = await createGuestSchools(tx, newSchoolNames, admin);
      for (const school of newSchools.values()) schoolSlugById.set(school.id, school.slug);
      const toSchool = (side: SideSpec | null): SideSpec | null =>
        side?.kind === "newSchool" ? { kind: "school", schoolId: newSchools.get(side.name.toLowerCase())!.id } : side;
      for (const row of planned) {
        row.home = toSchool(row.home);
        row.away = toSchool(row.away);
      }

      function resolveSide(spec: SideSpec | null, existingParticipant: { schoolId: string } | null): ResolvedSide {
        // Drops a stale participant from an earlier upload; otherwise a no-op.
        if (!spec) return existingParticipant ? { participantAction: "clear" } : { participantAction: "none" };
        if (spec.kind === "school") {
          if (!existingParticipant) return { participantAction: "create", schoolId: spec.schoolId };
          if (existingParticipant.schoolId === spec.schoolId) return { participantAction: "none" };
          return { participantAction: "replace", schoolId: spec.schoolId };
        }
        if (existingParticipant) return { participantAction: "none" };
        if (spec.kind === "standing") return { participantAction: "pending-standing", position: spec.position };
        if (spec.kind === "label") return { participantAction: "pending-label", text: spec.text };
        if (spec.kind === "newSchool") throw new Error("New schools are created before rows are written.");
        return { participantAction: "pending", sourceEventId: gameIdToEventId.get(spec.refGameId)!, outcome: spec.outcome };
      }

      function incomingSchoolId(resolved: ResolvedSide): string | null {
        return resolved.participantAction === "create" || resolved.participantAction === "replace" ? resolved.schoolId : null;
      }

      function currentSchoolId(resolved: ResolvedSide, existingParticipant: { schoolId: string } | null): string | null {
        if (
          resolved.participantAction === "pending" ||
          resolved.participantAction === "pending-standing" ||
          resolved.participantAction === "pending-label" ||
          resolved.participantAction === "clear"
        )
          return null;
        if (resolved.participantAction === "none") return existingParticipant?.schoolId ?? null;
        return resolved.schoolId;
      }

      type SourceFields = { eventId: string | null; outcome: "WINNER" | "LOSER" | null; standing: number | null; label: string | null };

      function sourceFieldsFor(resolved: ResolvedSide): SourceFields | undefined {
        if (resolved.participantAction === "pending") {
          return { eventId: resolved.sourceEventId, outcome: resolved.outcome, standing: null, label: null };
        }
        if (resolved.participantAction === "pending-standing") {
          return { eventId: null, outcome: null, standing: resolved.position, label: null };
        }
        if (resolved.participantAction === "pending-label") {
          return { eventId: null, outcome: null, standing: null, label: resolved.text };
        }
        if (resolved.participantAction === "create" || resolved.participantAction === "replace" || resolved.participantAction === "clear") {
          return { eventId: null, outcome: null, standing: null, label: null };
        }
        return undefined; // "none" - leave whatever was already stored
      }

      for (const row of planned) {
        const loaded = row.gameId ? existingByGameId.get(row.gameId) : undefined;
        // A bracket game's sides may have just been filled or emptied by an
        // earlier row's result (see resolvePlayoffSlots), so it's read again.
        const existing =
          loaded && (loaded.homeSourceEventId || loaded.awaySourceEventId)
            ? {
                ...loaded,
                ...(await tx.event.findUniqueOrThrow({ where: { id: loaded.id }, select: { participants: true, results: true } })),
              }
            : loaded;
        const existingHome = existing?.participants.find((p) => p.isHome) ?? null;
        const existingAway = existing?.participants.find((p) => !p.isHome) ?? null;

        let homeResolved = resolveSide(row.home, existingHome);
        let awayResolved = resolveSide(row.away, existingAway);
        // A side that's still a placeholder keeps whichever school already
        // filled it - unless the file now names that same school for the
        // other side, in which case the placeholder goes back to pending.
        let vacateHome = homeResolved.participantAction === "clear" || homeResolved.participantAction === "replace";
        let vacateAway = awayResolved.participantAction === "clear" || awayResolved.participantAction === "replace";
        if (existingAway && awayResolved.participantAction === "none" && incomingSchoolId(homeResolved) === existingAway.schoolId) {
          awayResolved = resolveSide(row.away, null);
          vacateAway = true;
        }
        if (existingHome && homeResolved.participantAction === "none" && incomingSchoolId(awayResolved) === existingHome.schoolId) {
          homeResolved = resolveSide(row.home, null);
          vacateHome = true;
        }
        const homeSource = sourceFieldsFor(homeResolved);
        const awaySource = sourceFieldsFor(awayResolved);
        for (const source of [homeSource, awaySource]) if (source?.eventId) feedsBracket.add(source.eventId);

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
              order: row.order,
              ...(homeSource
                ? {
                    homeSourceEventId: homeSource.eventId,
                    homeSourceOutcome: homeSource.outcome,
                    homeSourceStanding: homeSource.standing,
                    homeSourceLabel: homeSource.label,
                  }
                : {}),
              ...(awaySource
                ? {
                    awaySourceEventId: awaySource.eventId,
                    awaySourceOutcome: awaySource.outcome,
                    awaySourceStanding: awaySource.standing,
                    awaySourceLabel: awaySource.label,
                  }
                : {}),
            },
          });
          eventId = existing.id;
          updatedIds.push(eventId);
        } else {
          const homeSlugId = currentSchoolId(homeResolved, existingHome);
          const awaySlugId = currentSchoolId(awayResolved, existingAway);
          const base = row.gameId
            ? `game-${slugify(row.gameId) || "row"}`
            : [
                row.date.toISOString().slice(0, 10),
                homeSlugId ? schoolSlugById.get(homeSlugId) : "tbd",
                awaySlugId ? schoolSlugById.get(awaySlugId) : "tbd",
              ].join("-").slice(0, 90);
          let slug = base;
          let suffix = 1;
          while (takenSlugs.has(slug)) {
            suffix += 1;
            slug = `${base}-${suffix}`;
          }
          takenSlugs.add(slug);

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
              order: row.order,
              externalId: row.gameId,
              gameNumber: gameNumberOf(row.gameId),
              homeSourceEventId: homeSource?.eventId ?? null,
              homeSourceOutcome: homeSource?.outcome ?? null,
              homeSourceStanding: homeSource?.standing ?? null,
              homeSourceLabel: homeSource?.label ?? null,
              awaySourceEventId: awaySource?.eventId ?? null,
              awaySourceOutcome: awaySource?.outcome ?? null,
              awaySourceStanding: awaySource?.standing ?? null,
              awaySourceLabel: awaySource?.label ?? null,
            },
          });
          eventId = event.id;
          createdIds.push(eventId);
        }

        // Both sides' outgoing schools are removed before either incoming one
        // is added: a school can only be in a game once, so adding first would
        // crash whenever a school moves to the other side of the same game (a
        // re-upload with home and away swapped, say). Removing a school also
        // drops its result.
        const vacated = [
          ...(existingHome && vacateHome ? [existingHome] : []),
          ...(existingAway && vacateAway ? [existingAway] : []),
        ];
        if (vacated.length > 0) {
          await tx.result.deleteMany({ where: { eventId, schoolId: { in: vacated.map((p) => p.schoolId) } } });
          await tx.eventParticipant.deleteMany({ where: { eventId, OR: vacated.map((p) => ({ isHome: p.isHome })) } });
        }
        const incoming = [
          { isHome: true, schoolId: incomingSchoolId(homeResolved) },
          { isHome: false, schoolId: incomingSchoolId(awayResolved) },
        ].filter((side): side is { isHome: boolean; schoolId: string } => side.schoolId !== null);
        if (incoming.length > 0) {
          await tx.eventParticipant.createMany({ data: incoming.map((side) => ({ eventId, ...side })) });
        }

        // Scores and outcomes are worked out here rather than read back: a
        // blank score cell keeps the school's stored score, unless it was just
        // removed from the game above.
        const vacatedIds = new Set(vacated.map((p) => p.schoolId));
        const storedScore = (schoolId: string) =>
          vacatedIds.has(schoolId) ? null : (existing?.results.find((r) => r.schoolId === schoolId)?.score ?? null);
        const homeSchoolId = currentSchoolId(homeResolved, existingHome);
        const awaySchoolId = currentSchoolId(awayResolved, existingAway);
        const homeScore = homeSchoolId ? (row.homeScore ?? storedScore(homeSchoolId)) : null;
        const awayScore = awaySchoolId ? (row.awayScore ?? storedScore(awaySchoolId)) : null;
        const outcomes = homeSchoolId && awaySchoolId ? computeOutcomes(scoringType, homeScore, awayScore) : { home: null, away: null };
        const resultWrites = [
          { schoolId: homeSchoolId, score: row.homeScore, outcome: outcomes.home },
          { schoolId: awaySchoolId, score: row.awayScore, outcome: outcomes.away },
        ].flatMap(({ schoolId, score, outcome }) => {
          if (!schoolId) return [];
          const changes = { ...(score !== null ? { score } : {}), ...(outcome ? { outcome } : {}) };
          const isIncoming = incoming.some((side) => side.schoolId === schoolId);
          return isIncoming || Object.keys(changes).length > 0 ? [{ schoolId, changes }] : [];
        });
        if (!existing) {
          // A new game has no results yet, so both go in at once.
          if (resultWrites.length > 0) {
            await tx.result.createMany({ data: resultWrites.map((w) => ({ eventId, schoolId: w.schoolId, ...w.changes })) });
          }
        } else {
          for (const { schoolId, changes } of resultWrites) {
            await tx.result.upsert({
              where: { eventId_schoolId: { eventId, schoolId } },
              create: { eventId, schoolId, ...changes },
              update: changes,
            });
          }
        }

        // A blank custom-field cell clears that field.
        if (existing) {
          await tx.eventFieldValue.deleteMany({ where: { eventId, fieldId: { in: row.fieldValues.map((fv) => fv.fieldId) } } });
        }
        const fieldValues = row.fieldValues.filter((fv): fv is { fieldId: string; value: string } => fv.value !== null);
        if (fieldValues.length > 0) {
          await tx.eventFieldValue.createMany({ data: fieldValues.map((fv) => ({ eventId, ...fv })) });
        }

        // A game created by this file can't have games waiting on it yet -
        // later rows that do are filled in as they're written, below.
        if (existing && feedsBracket.has(eventId)) await resolvePlayoffSlots(tx, eventId);
        if (homeResolved.participantAction === "pending") {
          await tryFillFromExistingSource(tx, eventId, true, homeResolved.sourceEventId, homeResolved.outcome);
        }
        if (awayResolved.participantAction === "pending") {
          await tryFillFromExistingSource(tx, eventId, false, awayResolved.sourceEventId, awayResolved.outcome);
        }

        if (row.gameId) gameIdToEventId.set(row.gameId, eventId);
      }

      const removedIds: string[] = [];
      let removedFiles: string[] = [];
      if (replaceExisting) {
        const fileGameIds = new Set(planned.map((r) => r.gameId).filter((id): id is string => id !== null));
        const toRemove = existingEvents.filter((e) => e.externalId && !fileGameIds.has(e.externalId));
        if (toRemove.length > 0) {
          removedFiles = await storedFilesFor(tx, { eventIds: toRemove.map((e) => e.id) });
          await tx.event.deleteMany({ where: { id: { in: toRemove.map((e) => e.id) } } });
          removedIds.push(...toRemove.map((e) => e.id));
        }
      }

      // Same rule as a hand-created game: anyone named in the file is taking
      // part, so the roster follows the schedule rather than blocking it.
      const importedSchoolIds = planned.flatMap((row) =>
        [row.home, row.away]
          .filter((side): side is Extract<typeof side, { kind: "school" }> => side?.kind === "school")
          .map((side) => side.schoolId)
      );
      await ensureInRoster(tx, tournament.id, importedSchoolIds);

      return { createdIds, updatedIds, removedIds, removedFiles, newSchoolNames: [...newSchools.values()].map((school) => school.name) };
    },
    { timeout: 60_000 }
  );
  await deleteStoredFiles(removedFiles);

  // Runs after the transaction commits, not inside it - it needs to see
  // every row this file just wrote (see resolveStandingSlots).
  await resolveStandingSlots(prisma, tournament.id);

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

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard");
  if (newSchoolNames.length > 0) revalidatePath("/dashboard/admin/schools");
  return { ok: true, created: createdIds.length, updated: updatedIds.length, removed: removedIds.length, newSchools: newSchoolNames };
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
  // An Academic Games timeline item also has a title and an end time (on
  // the same day as its start) - only sent by that form.
  const timeline: { title?: string; endDate?: Date | null } = {};
  const titleRaw = formData.get("title");
  if (typeof titleRaw === "string" && isAdmin) {
    if (!titleRaw.trim()) return { ok: false, error: "Give it a title." };
    timeline.title = titleRaw.trim().slice(0, 200);
  }
  const endRaw = formData.get("endTime");
  if (typeof endRaw === "string" && isAdmin) {
    const time = endRaw.match(/^(\d{2}):(\d{2})$/);
    if (endRaw && !time) return { ok: false, error: "The end time isn't a time." };
    if (time) {
      const end = new Date(parsed.data.date);
      end.setHours(Number(time[1]), Number(time[2]), 0, 0);
      if (end <= parsed.data.date) return { ok: false, error: "The end time is before the start." };
      timeline.endDate = end;
    } else {
      timeline.endDate = null;
    }
  }

  await prisma.event.update({ where: { id: event.id }, data: { ...after, ...timeline } });

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
              ? { homeSourceEventId: null, homeSourceOutcome: null, homeSourceStanding: null, homeSourceLabel: null }
              : { awaySourceEventId: null, awaySourceOutcome: null, awaySourceStanding: null, awaySourceLabel: null },
          }),
        ]);

        if (side.target) await ensureInRoster(prisma, event.tournamentId, [side.target]);

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
      // A row left blank (or 0-0) isn't a set that was played - skip it
      // rather than saving it as a real 0-0 set.
      if (!homeScores[i]?.trim() && !awayScores[i]?.trim()) continue;
      if (Number(homeScores[i] || 0) === 0 && Number(awayScores[i] || 0) === 0) continue;
      const setParsed = setScoreEntrySchema.safeParse({
        setNumber: newSets.length + 1,
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
  // its winner/loser ("winner of this game plays..."), or a placement slot
  // whose division just finished its group stage ("4th place plays...").
  await resolvePlayoffSlots(prisma, event.id);
  await resolveStandingSlots(prisma, event.tournamentId);

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

  revalidateTournament({ slug: event.tournament.slug, activitySlug: event.tournament.activity.slug });
  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  revalidatePath("/dashboard");
  // This edit page too, so the form shows what was just saved - otherwise it
  // resets to the values it was first loaded with (e.g. still "Completed").
  revalidatePath(`/dashboard/events/${event.id}`);
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
