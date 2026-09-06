"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { activityInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createActivityAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = activityInputSchema.safeParse({
    seasonId: formData.get("seasonId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    sport: formData.get("sport"),
    scoringType: formData.get("scoringType") || "WIN_LOSS",
    winPoints: formData.get("winPoints") || 3,
    drawPoints: formData.get("drawPoints") || 1,
    lossPoints: formData.get("lossPoints") || 0,
    divisionNames: formData.getAll("divisionNames"),
    defaultHostSchoolId: formData.get("defaultHostSchoolId") || null,
    showWins: formData.get("showWins") === "on",
    showLosses: formData.get("showLosses") === "on",
    showPointsFor: formData.get("showPointsFor") === "on",
    showPointsAgainst: formData.get("showPointsAgainst") === "on",
    showPlayed: formData.get("showPlayed") === "on",
    usesSetScores: formData.get("usesSetScores") === "on",
    usesMeetResults: formData.get("usesMeetResults") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const season = await prisma.season.findUnique({ where: { id: parsed.data.seasonId } });
  if (!season) return { ok: false, error: "Season not found." };

  const existing = await prisma.activity.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { ok: false, error: "An activity with that URL slug already exists." };

  const activity = await prisma.activity.create({
    data: {
      seasonId: parsed.data.seasonId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      sport: parsed.data.sport,
      scoringType: parsed.data.scoringType,
      winPoints: parsed.data.winPoints,
      drawPoints: parsed.data.drawPoints,
      lossPoints: parsed.data.lossPoints,
      defaultHostSchoolId: parsed.data.defaultHostSchoolId || null,
      showWins: parsed.data.showWins,
      showLosses: parsed.data.showLosses,
      showPointsFor: parsed.data.showPointsFor,
      showPointsAgainst: parsed.data.showPointsAgainst,
      showPlayed: parsed.data.showPlayed,
      usesSetScores: parsed.data.usesSetScores,
      usesMeetResults: parsed.data.usesMeetResults,
      divisions: {
        create: parsed.data.divisionNames.map((name) => ({ name, slug: slugify(name) })),
      },
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACTIVITY_CREATE",
    entityType: "Activity",
    entityId: activity.id,
    summary: `${admin.name} created activity "${activity.name}" in ${season.name}`,
    after: { name: activity.name, scoringType: activity.scoringType, divisions: parsed.data.divisionNames },
  });

  revalidatePath("/dashboard/admin/tournaments");
  revalidatePath("/");
  return { ok: true };
}

export async function updateActivityAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const existing = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!existing) return { ok: false, error: "Activity not found." };

  const parsed = activityInputSchema.omit({ slug: true, divisionNames: true }).safeParse({
    seasonId: formData.get("seasonId") || existing.seasonId,
    name: formData.get("name"),
    sport: formData.get("sport"),
    scoringType: formData.get("scoringType") || "WIN_LOSS",
    winPoints: formData.get("winPoints") || 3,
    drawPoints: formData.get("drawPoints") || 1,
    lossPoints: formData.get("lossPoints") || 0,
    defaultHostSchoolId: formData.get("defaultHostSchoolId") || null,
    showWins: formData.get("showWins") === "on",
    showLosses: formData.get("showLosses") === "on",
    showPointsFor: formData.get("showPointsFor") === "on",
    showPointsAgainst: formData.get("showPointsAgainst") === "on",
    showPlayed: formData.get("showPlayed") === "on",
    usesSetScores: formData.get("usesSetScores") === "on",
    usesMeetResults: formData.get("usesMeetResults") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: { ...parsed.data, defaultHostSchoolId: parsed.data.defaultHostSchoolId || null },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACTIVITY_UPDATE",
    entityType: "Activity",
    entityId: activityId,
    summary: `${admin.name} updated activity "${parsed.data.name}"`,
    before: existing,
    after: parsed.data,
  });

  revalidatePath(`/tournaments/${existing.slug}`);
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

export async function addDivisionAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 40) return { ok: false, error: "Enter a division name (up to 40 characters)." };

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, error: "Activity not found." };

  const slug = slugify(name);
  const existing = await prisma.division.findUnique({ where: { activityId_slug: { activityId, slug } } });
  if (existing) return { ok: false, error: "That division already exists." };

  const division = await prisma.division.create({ data: { activityId, name, slug } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "DIVISION_CREATE",
    entityType: "Division",
    entityId: division.id,
    summary: `${admin.name} added division "${name}" to "${activity.name}"`,
    after: { name },
  });

  revalidatePath(`/dashboard/admin/tournaments`);
  revalidatePath(`/tournaments/${activity.slug}`);
  revalidatePath("/tournaments");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: true };
}
