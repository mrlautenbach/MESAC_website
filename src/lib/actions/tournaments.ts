"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { tournamentInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";

// Creating a new edition for an activity is the "archive" action: the
// previous current edition simply stops being current (isCurrent: false)
// but is untouched otherwise - it and everything under it (events, results,
// photos, documents) stays exactly as it was and remains browsable at its
// own permanent URL, linked from the activity page's archive list.
export async function createTournamentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireUser();

  const parsed = tournamentInputSchema.safeParse({
    activityId: formData.get("activityId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    hostSchoolId: formData.get("hostSchoolId") || null,
    archived: formData.get("archived") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  const activity = await prisma.activity.findUnique({
    where: { id: parsed.data.activityId },
    include: { divisions: { where: { tournamentId: null } } },
  });
  if (!activity) return { ok: false, error: "Activity not found." };

  const existingSlug = await prisma.tournament.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug) return { ok: false, error: "A tournament with that URL slug already exists." };

  const [tournament] = await prisma.$transaction([
    prisma.tournament.create({ data: parsed.data }),
    prisma.tournament.updateMany({
      where: { activityId: parsed.data.activityId, isCurrent: true },
      data: { isCurrent: false },
    }),
  ]);

  // Give the new tournament its own independent copy of the activity's
  // current default divisions - editing them from here on (adding a
  // division, removing one) never touches the default template or any
  // other edition of this activity.
  if (activity.divisions.length > 0) {
    await prisma.division.createMany({
      data: activity.divisions.map((d) => ({
        activityId: activity.id,
        tournamentId: tournament.id,
        name: d.name,
        slug: d.slug,
      })),
    });
  }

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_CREATE",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} started a new tournament ("${tournament.name}") for "${activity.name}", archiving the previous one`,
    after: parsed.data,
  });

  revalidatePath(`/tournaments/${activity.slug}`);
  revalidatePath("/dashboard/admin/tournaments");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTournamentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireUser();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { activity: true } });
  if (!existing) return { ok: false, error: "Tournament not found." };

  const parsed = tournamentInputSchema.omit({ slug: true, activityId: true }).safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    hostSchoolId: formData.get("hostSchoolId") || null,
    archived: formData.get("archived") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  await prisma.tournament.update({ where: { id: tournamentId }, data: parsed.data });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_UPDATE",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} updated tournament "${parsed.data.name}"`,
    before: existing,
    after: parsed.data,
  });

  revalidatePath(`/seasons/${existing.slug}`);
  revalidatePath(`/tournaments/${existing.activity.slug}`);
  return { ok: true };
}
