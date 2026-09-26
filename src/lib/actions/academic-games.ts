"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { revalidateTournament } from "@/lib/revalidate";
import { parseCsv, csvRowsToObjects } from "@/lib/csv";
import { findDivision } from "@/lib/divisionAlias";
import { isBowlItem, matchTrack, parseClock, RUN_BY_FIELD, trackNames } from "@/lib/academicGames";
import {
  bowlStandings,
  gameCode,
  gameLabel,
  parseRound,
  parseSource,
  parseTeamName,
  resolveFinals,
  roundRobinComplete,
  teamLabel,
  type BowlStage,
} from "@/lib/bowl";
import type { Prisma } from "@/generated/prisma";

export type AcademicImportResult =
  | { ok: true; summary: string }
  | { ok: false; error: string; rowErrors?: { row: number; message: string }[] };

type RowError = { row: number; message: string };

async function readCsvText(formData: FormData): Promise<string> {
  const file = formData.get("csvFile");
  const pasted = formData.get("csvText");
  return file instanceof File && file.size > 0 ? await file.text() : typeof pasted === "string" ? pasted : "";
}

async function loadAcademicTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: true, divisions: true },
  });
  if (!tournament) return { ok: false as const, error: "Tournament not found." };
  if (!tournament.activity.usesAcademicFormat) {
    return { ok: false as const, error: "This activity doesn't use the Academic Games format." };
  }
  return { ok: true as const, tournament };
}

// Adds Varsity / Junior Varsity the first time an upload uses them, and
// returns each new one's id by name.
async function createTracks(
  tx: Prisma.TransactionClient,
  tournament: { id: string; activityId: string },
  names: string[]
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of new Set(names)) {
    const created = await tx.division.create({
      data: { activityId: tournament.activityId, tournamentId: tournament.id, name, slug: slugify(name) },
    });
    ids.set(name, created.id);
  }
  return ids;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const addedTracks = (names: string[]) =>
  names.length > 0 ? ` Added the ${names.join(" and ")} division${names.length === 1 ? "" : "s"}.` : "";

const REQUIRED_HEADERS = ["date", "start", "title"];
// A blank team cell means every team; so do these.
const EVERYONE = new Set(["all", "both", "everyone", "all teams"]);

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
  _prev: AcademicImportResult | null,
  formData: FormData
): Promise<AcademicImportResult> {
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

  const text = await readCsvText(formData);
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." };

  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one schedule row." };
  const { header, records } = csvRowsToObjects(rows);
  if (REQUIRED_HEADERS.some((h) => !header.includes(h))) {
    return { ok: false, error: "The header row needs at least: date, start, title (plus optional end, team, venue, run_by)." };
  }

  const rowErrors: RowError[] = [];
  const planned: PlannedItem[] = [];
  const keyRows = new Map<string, number>();

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
      division = matchTrack(tournament.divisions, teamRaw) ?? null;
      if (!division) errors.push(`Unknown team "${teamRaw}" (use ${trackNames(tournament.divisions)}, or leave it blank for every team).`);
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
    const newDivisionIds = await createTracks(
      tx,
      tournament,
      planned.flatMap((p) => (p.division && "newName" in p.division ? [p.division.newName] : []))
    );
    const newDivisionNames = [...newDivisionIds.keys()];
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
  return {
    ok: true,
    summary: `Schedule saved: ${result.created} added, ${result.updated} updated, ${result.removed} removed.${addedTracks(result.newDivisions)}`,
  };
}

// ── The Academic Bowl ──────────────────────────────────────────────────

// Brings every division's finals up to date after its games or scores
// change: seeds from a finished round robin, then each finals game's winner
// and loser into the games waiting on them. Returns how many games changed.
async function resolveBowlFinals(tx: Prisma.TransactionClient, tournamentId: string): Promise<number> {
  const [teams, games] = await Promise.all([
    tx.bowlTeam.findMany({ where: { tournamentId }, include: { school: true } }),
    tx.bowlGame.findMany({ where: { tournamentId } }),
  ]);
  let changed = 0;
  for (const divisionId of new Set(games.map((g) => g.divisionId))) {
    const own = games.filter((g) => g.divisionId === divisionId);
    const table = bowlStandings(
      teams.filter((t) => t.divisionId === divisionId).map((t) => ({ id: t.id, label: teamLabel(t) })),
      own
    );
    const seeds = roundRobinComplete(own) ? table.map((r) => r.team.id) : null;
    for (const { id, ...data } of resolveFinals(own, seeds)) {
      await tx.bowlGame.update({ where: { id }, data });
      changed++;
    }
  }
  return changed;
}

const BOWL_HEADERS = ["division", "round", "date", "time", "team_a", "team_b"];

// One side of a planned game: a team (its key - see teamKey), or for a
// finals slot a source ("seed 1", "winner QF1") or nothing yet.
type PlannedSide = { team: string } | { source: string | null };

type PlannedGame = {
  rowNum: number;
  divisionKey: string;
  stage: BowlStage;
  number: number;
  startTime: Date;
  room: string | null;
  a: PlannedSide;
  b: PlannedSide;
  scores: { a: number; b: number } | null;
};

const teamKey = (divisionKey: string, schoolId: string, name: string) => `${divisionKey}|${schoolId}|${name.toLowerCase()}`;

function parseBowlScore(raw: string): number | null | "bad" {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : "bad";
}

// The Academic Bowl's games from one CSV, in the shape of the league's
// bowl sheet: division, round (1-24, or QF1-QF4, SF1-SF2, Consolation,
// Final), date, time, team_a, team_b, room, score_a, score_b. Teams are
// written as the sheet does ("ASDubai Blue") and added as they appear. A
// finals slot can name its team, or where it comes from ("seed 1",
// "winner QF1"). For each division in the file, the file is its whole bowl
// schedule: games are matched by round and teams (finals by their code) and
// updated in place, and games no longer in the file are removed. A blank
// score leaves any score already entered alone.
export async function importBowlScheduleAction(_prev: AcademicImportResult | null, formData: FormData): Promise<AcademicImportResult> {
  const admin = await requireAdmin();
  const loaded = await loadAcademicTournament(String(formData.get("tournamentId") ?? ""));
  if (!loaded.ok) return loaded;
  const { tournament } = loaded;

  const text = await readCsvText(formData);
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one game row." };
  const { header, records } = csvRowsToObjects(rows);
  if (BOWL_HEADERS.some((h) => !header.includes(h))) {
    return {
      ok: false,
      error: "The header row needs: division, round, date, time, team_a, team_b (plus optional room, score_a, score_b).",
    };
  }

  const schools = await prisma.school.findMany();
  const schoolByKey = new Map<string, (typeof schools)[number]>();
  for (const s of schools) {
    schoolByKey.set(s.name.trim().toLowerCase(), s);
    if (s.code) schoolByKey.set(s.code.trim().toLowerCase(), s);
  }

  const rowErrors: RowError[] = [];
  const planned: PlannedGame[] = [];
  // New teams by key, and which divisions still need adding.
  const teams = new Map<string, { divisionKey: string; schoolId: string; name: string }>();
  const newTracks = new Set<string>();
  const gameRows = new Map<string, number>();
  const busyRows = new Map<string, number>(); // a team's slot in a round -> row

  records.forEach((record, i) => {
    const rowNum = i + 2;
    if (Object.values(record).every((v) => !v.trim())) return;
    const get = (name: string) => (record[name] ?? "").trim();
    const errors: string[] = [];

    const divisionRaw = get("division");
    const track = divisionRaw ? matchTrack(tournament.divisions, divisionRaw) : undefined;
    if (!divisionRaw) errors.push("Missing division.");
    else if (!track) errors.push(`Unknown division "${divisionRaw}" (use ${trackNames(tournament.divisions)}).`);
    const divisionKey = track ? ("id" in track ? track.id : `new:${track.newName}`) : "";

    const round = parseRound(get("round"));
    if (!round) errors.push(`Round "${get("round")}" isn't a round number or a finals game (QF1-QF4, SF1-SF2, Consolation, Final).`);

    const dateRaw = get("date");
    const time = parseClock(get("time"));
    const startTime = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) && time ? new Date(`${dateRaw}T00:00:00`) : null;
    if (!startTime || Number.isNaN(startTime.getTime())) errors.push(`Date "${dateRaw}" and time "${get("time")}" must be YYYY-MM-DD and 13:45 or 1:45pm.`);
    else startTime.setHours(time!.hours, time!.minutes, 0, 0);

    const finals = round !== null && round.stage !== "ROUND_ROBIN";
    const side = (column: string): PlannedSide | null => {
      const raw = get(column);
      if (!raw) {
        if (finals) return { source: null };
        errors.push(`Missing ${column}.`);
        return null;
      }
      const team = parseTeamName(raw, schoolByKey);
      if (team) {
        const key = teamKey(divisionKey, team.school.id, team.name);
        teams.set(key, { divisionKey, schoolId: team.school.id, name: team.name });
        return { team: key };
      }
      const source = finals ? parseSource(raw) : null;
      if (source) return { source };
      errors.push(
        finals
          ? `${column} "${raw}" isn't a team, a seed ("seed 1") or a game ("winner QF1").`
          : `Unknown team "${raw}" (write it as the school and its colour, e.g. "ASDubai Blue").`
      );
      return null;
    };
    const a = side("team_a");
    const b = side("team_b");
    if (a && b && "team" in a && "team" in b && a.team === b.team) errors.push("team_a and team_b are the same team.");

    const scoreA = parseBowlScore(get("score_a"));
    const scoreB = parseBowlScore(get("score_b"));
    if (scoreA === "bad" || scoreB === "bad") errors.push("Scores must be whole numbers 0-999.");
    else if ((scoreA === null) !== (scoreB === null)) errors.push("Give both scores, or leave both blank.");
    else if (scoreA !== null && [a, b].some((side) => side && "source" in side && !side.source)) {
      errors.push("A game needs both teams before it can have a score.");
    }

    if (errors.length > 0 || !track || !round || !startTime || !a || !b) {
      rowErrors.push({ row: rowNum, message: errors.join(" ") });
      return;
    }
    if ("newName" in track) newTracks.add(track.newName);

    // One row per game, and a team plays once per round.
    const teamsIn = ([["team_a", a], ["team_b", b]] as const).flatMap(([column, s]) => ("team" in s ? [{ column, key: s.team }] : []));
    const slotOf = (team: string) => `${divisionKey}|${round.stage}|${finals ? "" : round.number}|${team}`;
    const key = finals
      ? `${divisionKey}|${round.stage}|${round.number}`
      : `${divisionKey}|${round.number}|${teamsIn.map((t) => t.key).sort().join("|")}`;
    const where = finals ? gameLabel(round.stage, round.number) : `round ${round.number}`;
    if (gameRows.has(key)) {
      rowErrors.push({ row: rowNum, message: `This game is already in the file (row ${gameRows.get(key)}).` });
      return;
    }
    const busy = teamsIn.find((t) => busyRows.has(slotOf(t.key)));
    if (busy) {
      rowErrors.push({ row: rowNum, message: `${get(busy.column)} already plays in ${where} (row ${busyRows.get(slotOf(busy.key))}).` });
      return;
    }
    gameRows.set(key, rowNum);
    for (const t of teamsIn) busyRows.set(slotOf(t.key), rowNum);

    planned.push({
      rowNum,
      divisionKey,
      stage: round.stage,
      number: round.number,
      startTime,
      room: get("room").slice(0, 100) || null,
      a,
      b,
      scores: scoreA !== null && scoreB !== null ? { a: scoreA as number, b: scoreB as number } : null,
    });
  });

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is saved.`, rowErrors };
  }
  if (planned.length === 0) return { ok: false, error: "No game rows found in the file." };

  const result = await prisma.$transaction(
    async (tx) => {
      const newDivisionIds = await createTracks(tx, tournament, [...newTracks]);
      const divisionIdOf = (key: string) => (key.startsWith("new:") ? newDivisionIds.get(key.slice(4))! : key);
      const divisionIds = [...new Set(planned.map((g) => divisionIdOf(g.divisionKey)))];

      const teamIds = new Map<string, string>();
      for (const [key, team] of teams) {
        const divisionId = divisionIdOf(team.divisionKey);
        const saved = await tx.bowlTeam.upsert({
          where: { divisionId_schoolId_name: { divisionId, schoolId: team.schoolId, name: team.name } },
          create: { tournamentId: tournament.id, divisionId, schoolId: team.schoolId, name: team.name },
          update: {},
        });
        teamIds.set(key, saved.id);
      }

      const existing = await tx.bowlGame.findMany({ where: { tournamentId: tournament.id, divisionId: { in: divisionIds } } });
      const existingKey = (g: (typeof existing)[number]) =>
        g.stage === "ROUND_ROBIN"
          ? `${g.divisionId}|${g.number}|${[g.teamAId, g.teamBId].sort().join("|")}`
          : `${g.divisionId}|${g.stage}|${g.number}`;
      const byKey = new Map(existing.map((g) => [existingKey(g), g]));
      const kept = new Set<string>();
      // Finals scores for slots whose teams aren't known until the bracket
      // is filled in below - e.g. a whole sheet uploaded at once.
      const waiting = new Map<string, { scoreA: number; scoreB: number }>();
      let created = 0;
      let updated = 0;

      for (const game of planned) {
        const divisionId = divisionIdOf(game.divisionKey);
        const teamA = "team" in game.a ? teamIds.get(game.a.team)! : null;
        const teamB = "team" in game.b ? teamIds.get(game.b.team)! : null;
        const key =
          game.stage === "ROUND_ROBIN"
            ? `${divisionId}|${game.number}|${[teamA, teamB].sort().join("|")}`
            : `${divisionId}|${game.stage}|${game.number}`;
        const match = byKey.get(key);
        const sourceA = "source" in game.a ? game.a.source : null;
        const sourceB = "source" in game.b ? game.b.source : null;
        // A finals slot already filled from its source keeps its team.
        const keepA = !teamA && match && sourceA && match.sourceA === sourceA ? match.teamAId : null;
        const keepB = !teamB && match && sourceB && match.sourceB === sourceB ? match.teamBId : null;
        // Scores from the file win; a blank score keeps what was entered,
        // flipped if the file lists the two teams the other way round.
        const swapped = match && match.teamAId === (teamB ?? keepB) && match.teamBId === (teamA ?? keepA) && match.teamAId !== match.teamBId;
        const keptScores = match && !game.scores ? (swapped ? { a: match.scoreB, b: match.scoreA } : { a: match.scoreA, b: match.scoreB }) : null;
        // A score only stands on a game whose two teams are known - a
        // finals slot still waiting on its source takes its score later.
        const bothTeams = (teamA ?? keepA) !== null && (teamB ?? keepB) !== null;
        const data = {
          startTime: game.startTime,
          room: game.room,
          teamAId: teamA ?? keepA,
          teamBId: teamB ?? keepB,
          sourceA,
          sourceB,
          scoreA: bothTeams ? (game.scores ? game.scores.a : (keptScores?.a ?? null)) : null,
          scoreB: bothTeams ? (game.scores ? game.scores.b : (keptScores?.b ?? null)) : null,
        };
        let id: string;
        if (match) {
          await tx.bowlGame.update({ where: { id: match.id }, data });
          id = match.id;
          kept.add(match.id);
          updated++;
        } else {
          id = (await tx.bowlGame.create({ data: { ...data, tournamentId: tournament.id, divisionId, stage: game.stage, number: game.number } })).id;
          created++;
        }
        if (game.scores && !bothTeams) waiting.set(id, { scoreA: game.scores.a, scoreB: game.scores.b });
      }

      const stale = existing.filter((g) => !kept.has(g.id)).map((g) => g.id);
      if (stale.length > 0) await tx.bowlGame.deleteMany({ where: { id: { in: stale } } });
      // Teams no game mentions any more (a renamed team, a school that pulled out).
      await tx.bowlTeam.deleteMany({
        where: { divisionId: { in: divisionIds }, gamesAsA: { none: {} }, gamesAsB: { none: {} } },
      });
      // Fill the bracket a stage at a time: seeds into the Quarterfinals, then
      // each stage's scores decide who goes through to the next.
      for (let pass = 0; pass < 5; pass++) {
        await resolveBowlFinals(tx, tournament.id);
        const ready = await tx.bowlGame.findMany({
          where: { id: { in: [...waiting.keys()] }, teamAId: { not: null }, teamBId: { not: null } },
        });
        if (ready.length === 0) break;
        for (const g of ready) {
          await tx.bowlGame.update({ where: { id: g.id }, data: waiting.get(g.id)! });
          waiting.delete(g.id);
        }
      }
      const teamCount = await tx.bowlTeam.count({ where: { divisionId: { in: divisionIds } } });
      return { created, updated, removed: stale.length, teams: teamCount, newDivisions: [...newDivisionIds.keys()] };
    },
    { timeout: 60_000 }
  );

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "BOWL_SCHEDULE_IMPORT",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} uploaded the Academic Bowl schedule (${result.created} added, ${result.updated} updated, ${result.removed} removed)`,
    after: result,
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/academic-games");
  return {
    ok: true,
    summary: `Bowl schedule saved: ${plural(result.created, "game")} added, ${result.updated} updated, ${result.removed} removed, ${plural(result.teams, "team")}.${addedTracks(result.newDivisions)}`,
  };
}

// One round's scores from the admin page: `a-<gameId>` and `b-<gameId>`
// for each game. Both blank clears a game's score.
export async function saveBowlScoresAction(_prev: AcademicImportResult | null, formData: FormData): Promise<AcademicImportResult> {
  const admin = await requireAdmin();
  const ids = formData.getAll("gameId").map(String);
  const games = await prisma.bowlGame.findMany({
    where: { id: { in: ids } },
    include: { tournament: { include: { activity: true } } },
  });
  if (games.length === 0 || games.length !== ids.length) return { ok: false, error: "Game not found." };
  const tournament = games[0].tournament;
  if (games.some((g) => g.tournamentId !== tournament.id)) return { ok: false, error: "Those games are from different tournaments." };

  const updates: { id: string; scoreA: number | null; scoreB: number | null }[] = [];
  for (const game of games) {
    const a = parseBowlScore(String(formData.get(`a-${game.id}`) ?? "").trim());
    const b = parseBowlScore(String(formData.get(`b-${game.id}`) ?? "").trim());
    const label = gameCode(game.stage, game.number);
    if (a === "bad" || b === "bad") return { ok: false, error: `Scores must be whole numbers 0-999 (${label}).` };
    if ((a === null) !== (b === null)) return { ok: false, error: "Give both scores for a game, or leave both blank." };
    if (a !== null && (!game.teamAId || !game.teamBId)) return { ok: false, error: "A game needs both teams before it can have a score." };
    updates.push({ id: game.id, scoreA: a, scoreB: b });
  }

  const moved = await prisma.$transaction(async (tx) => {
    for (const { id, ...scores } of updates) await tx.bowlGame.update({ where: { id }, data: scores });
    return resolveBowlFinals(tx, tournament.id);
  });
  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "BOWL_SCORES_UPDATE",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} entered Academic Bowl scores (${gameLabel(games[0].stage, games[0].number)})`,
    after: { games: updates },
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/academic-games");
  return { ok: true, summary: moved > 0 ? `Saved - ${plural(moved, "finals game")} updated.` : "Saved." };
}

// ── The challenges ─────────────────────────────────────────────────────

const CHALLENGE_HEADERS = ["challenge", "school"];
const titleKey = (title: string) => title.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

// Challenge results from one CSV: challenge (its title on the schedule,
// e.g. "Math Challenge"), division (varsity or jv - needed for a challenge
// every team sits together), place, school, score. Each challenge and
// division in the file has its results replaced; ones not in the file are
// left alone, so results can go up one challenge at a time.
export async function importChallengeResultsAction(_prev: AcademicImportResult | null, formData: FormData): Promise<AcademicImportResult> {
  const admin = await requireAdmin();
  const loaded = await loadAcademicTournament(String(formData.get("tournamentId") ?? ""));
  if (!loaded.ok) return loaded;
  const { tournament } = loaded;

  const text = await readCsvText(formData);
  if (!text.trim()) return { ok: false, error: "Upload a .csv file or paste CSV text." };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The file needs a header row plus at least one result row." };
  const { header, records } = csvRowsToObjects(rows);
  if (CHALLENGE_HEADERS.some((h) => !header.includes(h)) || (!header.includes("place") && !header.includes("score"))) {
    return { ok: false, error: "The header row needs: challenge, school, and place or score (plus division)." };
  }

  const challenges = (await prisma.event.findMany({ where: { tournamentId: tournament.id } })).filter((e) => !isBowlItem(e.title ?? ""));
  if (challenges.length === 0) {
    return { ok: false, error: "There are no challenges on the schedule yet - upload the schedule first, then the results." };
  }
  const schools = await prisma.school.findMany();
  const schoolByKey = new Map<string, (typeof schools)[number]>();
  for (const s of schools) {
    schoolByKey.set(s.name.trim().toLowerCase(), s);
    if (s.code) schoolByKey.set(s.code.trim().toLowerCase(), s);
  }
  const needsDivision = tournament.divisions.length > 0;

  const rowErrors: RowError[] = [];
  const planned: { eventId: string; divisionId: string | null; schoolId: string; place: number | null; score: number | null }[] = [];
  const seen = new Map<string, number>();

  records.forEach((record, i) => {
    const rowNum = i + 2;
    if (Object.values(record).every((v) => !v.trim())) return;
    const get = (name: string) => (record[name] ?? "").trim();
    const errors: string[] = [];

    // The division first - it picks between two challenges with the same
    // title (Varsity's Math Challenge and JV's).
    const divisionRaw = get("division");
    const division = divisionRaw ? findDivision(tournament.divisions, divisionRaw) : undefined;
    if (divisionRaw && !division) errors.push(`Unknown division "${divisionRaw}" (use ${tournament.divisions.map((d) => d.name).join(", ")}).`);

    const challengeRaw = get("challenge");
    const key = titleKey(challengeRaw);
    let named = challenges.filter((c) => titleKey(c.title ?? "") === key);
    if (named.length === 0 && key) named = challenges.filter((c) => titleKey(c.title ?? "").includes(key));
    const matching = division ? named.filter((c) => !c.divisionId || c.divisionId === division.id) : named;
    let event: (typeof challenges)[number] | undefined;
    if (!challengeRaw) errors.push("Missing challenge.");
    else if (named.length === 0) errors.push(`No challenge called "${challengeRaw}" on the schedule.`);
    else if (new Set(matching.map((c) => titleKey(c.title ?? ""))).size > 1) errors.push(`"${challengeRaw}" matches more than one challenge - use its full title.`);
    else if (matching.length === 0) errors.push(`"${challengeRaw}" isn't a ${division?.name} challenge.`);
    else if (matching.length > 1) errors.push(`"${challengeRaw}" is on the schedule for more than one division - say which in the division column.`);
    else event = matching[0];

    // A challenge on one track takes its division from the schedule; one
    // every team sits together needs the row to say.
    const divisionId = event?.divisionId ?? division?.id ?? null;
    if (event && !event.divisionId && !division && needsDivision) {
      errors.push(`${event.title} is for every team - say which division this result is for.`);
    }

    const schoolRaw = get("school");
    const team = schoolRaw ? parseTeamName(schoolRaw, schoolByKey) : null;
    if (!schoolRaw) errors.push("Missing school.");
    else if (!team || team.name) errors.push(`Unknown school "${schoolRaw}".`);

    const placeRaw = get("place").replace(/(st|nd|rd|th|=)$/i, "");
    const place = placeRaw ? Number(placeRaw) : null;
    if (place !== null && (!Number.isInteger(place) || place < 1 || place > 99)) errors.push(`Place "${get("place")}" must be 1, 2, 3...`);
    const scoreRaw = get("score");
    const score = scoreRaw ? Number(scoreRaw) : null;
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100000)) errors.push(`Score "${scoreRaw}" isn't a number.`);
    if (!placeRaw && !scoreRaw) errors.push("Give a place, a score, or both.");

    if (errors.length > 0 || !event || !team) {
      rowErrors.push({ row: rowNum, message: errors.join(" ") });
      return;
    }
    const dup = `${event.id}|${divisionId}|${team.school.id}`;
    if (seen.has(dup)) {
      rowErrors.push({ row: rowNum, message: `${team.school.code || team.school.name} already has a result for this challenge (row ${seen.get(dup)}).` });
      return;
    }
    seen.set(dup, rowNum);
    planned.push({ eventId: event.id, divisionId, schoolId: team.school.id, place, score });
  });

  if (rowErrors.length > 0) {
    return { ok: false, error: `${rowErrors.length} row(s) need fixing before anything is saved.`, rowErrors };
  }
  if (planned.length === 0) return { ok: false, error: "No result rows found in the file." };

  const groups = [...new Set(planned.map((p) => `${p.eventId}|${p.divisionId ?? ""}`))];
  await prisma.$transaction(async (tx) => {
    for (const group of groups) {
      const [eventId, divisionId] = group.split("|");
      await tx.challengeResult.deleteMany({ where: { eventId, divisionId: divisionId || null } });
    }
    await tx.challengeResult.createMany({ data: planned.map((p) => ({ ...p, tournamentId: tournament.id })) });
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "CHALLENGE_RESULTS_IMPORT",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} uploaded Academic Games challenge results (${planned.length} results)`,
    after: { results: planned.length, challenges: groups.length },
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/academic-games");
  return {
    ok: true,
    summary: `Challenge results saved: ${plural(planned.length, "result")} across ${plural(groups.length, "challenge")} (counting each division separately).`,
  };
}
