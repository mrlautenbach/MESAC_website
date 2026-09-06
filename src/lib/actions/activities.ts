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

// Permanently removes an activity and everything under it - every
// tournament edition, event, result, photo, and document, cascaded by the
// schema - so its public pages stop resolving entirely. The admin must
// type the activity's exact name to confirm; there's no other guard here
// (unlike removing a single division) because deleting the whole activity
// on purpose always means deleting its history along with it.
export async function deleteActivityAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { ok: false, error: "Activity not found." };

  if (confirmName !== activity.name) {
    return { ok: false, error: `Type "${activity.name}" exactly to confirm deletion.` };
  }

  await prisma.activity.delete({ where: { id: activityId } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACTIVITY_DELETE",
    entityType: "Activity",
    entityId: activityId,
    summary: `${admin.name} permanently deleted activity "${activity.name}" and everything under it`,
    before: { name: activity.name, sport: activity.sport },
  });

  revalidatePath("/dashboard/admin/tournaments");
  revalidatePath("/tournaments");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: true };
}

// Reconciles a division set to exactly the checked names: creates any
// newly-checked name, deletes any existing division that got unchecked
// (an easy way to correct a mistake), and leaves everything else
// untouched. Refuses the whole submission - no partial changes - if any
// division slated for removal already has games on it, since
// Event.divisionId is set null rather than cascaded and silently
// orphaning real games into an undivided bucket would be confusing.
//
// With no tournamentId, this edits the activity's own default template
// (used to pre-fill a new tournament) - those rows never have real games,
// so the games-check never actually blocks there. With a tournamentId,
// this edits that one tournament's own independent copy, where the check
// is meaningful: it only ever counts that tournament's own games, never
// another edition's, because each tournament has its own division rows.
export async function syncDivisionsAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const tournamentId = String(formData.get("tournamentId") ?? "") || null;
  const names = Array.from(new Set(formData.getAll("divisionNames").map((n) => String(n).trim()).filter(Boolean)));
  if (names.some((n) => n.length > 40)) return { ok: false, error: "Division names must be 40 characters or fewer." };

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { divisions: { where: { tournamentId }, include: { _count: { select: { events: true } } } } },
  });
  if (!activity) return { ok: false, error: "Activity not found." };

  const checkedByLower = new Set(names.map((n) => n.toLowerCase()));
  const toRemove = activity.divisions.filter((d) => !checkedByLower.has(d.name.toLowerCase()));
  const blocked = toRemove.find((d) => d._count.events > 0);
  if (blocked) {
    return {
      ok: false,
      error: `Can't remove "${blocked.name}" - it has ${blocked._count.events} game${blocked._count.events === 1 ? "" : "s"} on it. Remove or move those first.`,
    };
  }

  const existingByLower = new Map(activity.divisions.map((d) => [d.name.toLowerCase(), d]));
  const toAdd = names.filter((n) => !existingByLower.has(n.toLowerCase()));

  await prisma.$transaction([
    ...toRemove.map((d) => prisma.division.delete({ where: { id: d.id } })),
    ...toAdd.map((name) => prisma.division.create({ data: { activityId, tournamentId, name, slug: slugify(name) } })),
  ]);

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "DIVISION_UPDATE",
    entityType: "Activity",
    entityId: activityId,
    summary: tournamentId
      ? `${admin.name} updated divisions for "${activity.name}"'s tournament`
      : `${admin.name} updated the default divisions for "${activity.name}"`,
    before: { divisions: activity.divisions.map((d) => d.name) },
    after: { divisions: names },
  });

  if (tournamentId) {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (tournament) {
      revalidatePath(`/seasons/${tournament.slug}`);
      revalidatePath(`/seasons/${tournament.slug}/schedule`);
      revalidatePath(`/seasons/${tournament.slug}/results`);
      revalidatePath(`/seasons/${tournament.slug}/watch-live`);
      revalidatePath(`/seasons/${tournament.slug}/team-photos`);
    }
  }
  revalidatePath(`/dashboard/admin/tournaments`);
  revalidatePath(`/tournaments/${activity.slug}`);
  revalidatePath("/tournaments");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: true };
}
