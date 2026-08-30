"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { eventInputSchema, resultEntrySchema, individualResultEntrySchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";
import { z } from "zod";

async function makeUniqueEventSlug(seasonId: string, date: Date, schoolSlugs: string[]) {
  const base = [date.toISOString().slice(0, 10), ...schoolSlugs].join("-").slice(0, 90);
  let slug = base;
  let suffix = 1;
  while (await prisma.event.findUnique({ where: { seasonId_slug: { seasonId, slug } } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export async function createEventAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = eventInputSchema.safeParse({
    seasonId: formData.get("seasonId"),
    divisionId: formData.get("divisionId") || null,
    title: formData.get("title") ?? "",
    date: formData.get("date"),
    location: formData.get("location") ?? "",
    status: formData.get("status") || "SCHEDULED",
    schoolIds: formData.getAll("schoolIds"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const season = await prisma.season.findUnique({ where: { id: parsed.data.seasonId }, include: { tournament: true } });
  if (!season) return { ok: false, error: "Season not found." };

  if (parsed.data.divisionId) {
    const division = await prisma.division.findUnique({ where: { id: parsed.data.divisionId } });
    if (!division || division.tournamentId !== season.tournamentId) {
      return { ok: false, error: "That division doesn't belong to this tournament." };
    }
  }

  const schools = await prisma.school.findMany({ where: { id: { in: parsed.data.schoolIds } } });
  if (schools.length !== parsed.data.schoolIds.length) {
    return { ok: false, error: "One or more selected schools could not be found." };
  }

  const slug = await makeUniqueEventSlug(
    season.id,
    parsed.data.date,
    schools.map((s) => s.slug)
  );

  const event = await prisma.event.create({
    data: {
      seasonId: season.id,
      divisionId: parsed.data.divisionId || null,
      slug,
      title: parsed.data.title || null,
      date: parsed.data.date,
      location: parsed.data.location || null,
      status: parsed.data.status,
      participants: { create: schools.map((s) => ({ schoolId: s.id })) },
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

  revalidatePath(`/seasons/${season.slug}`);
  revalidatePath(`/tournaments/${season.tournament.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateEventSchema = z.object({
  eventId: z.string().cuid(),
  date: z.coerce.date(),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]),
  recap: z.string().trim().max(4000).optional().or(z.literal("")),
});

export async function updateEventAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updateEventSchema.safeParse({
    eventId: formData.get("eventId"),
    date: formData.get("date"),
    location: formData.get("location") ?? "",
    status: formData.get("status"),
    recap: formData.get("recap") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId },
    include: { participants: true, results: true, season: { include: { tournament: true } }, division: true },
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
  };
  const after = {
    date: parsed.data.date,
    location: parsed.data.location || null,
    status: parsed.data.status,
    recap: parsed.data.recap || null,
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

  // Each participating school's result row is only touched if this
  // submission actually included fields for it: admins always include every
  // school; a school editor's form only renders their own school's fields,
  // and any other `result-<schoolId>-*` field is ignored server-side even if
  // present in the raw POST body, so a school can never overwrite another
  // school's result by tampering with the form.
  for (const schoolId of participantSchoolIds) {
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

  // Individual (per-athlete) scores, for LOW_SCORE seasons like golf. The
  // "present" marker distinguishes "no rows submitted for this school"
  // (field not rendered - skip) from "submitted as an empty list" (clear
  // all rows) - same school-scoping rule as team results above.
  for (const schoolId of participantSchoolIds) {
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

  revalidatePath(`/seasons/${event.season.slug}`);
  revalidatePath(`/seasons/${event.season.slug}/events/${event.slug}`);
  if (event.division) revalidatePath(`/seasons/${event.season.slug}/${event.division.slug}`);
  revalidatePath(`/tournaments/${event.season.tournament.slug}`);
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
