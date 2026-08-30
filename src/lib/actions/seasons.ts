"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { seasonInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";

// Creating a new edition for a tournament is the "archive" action: the
// previous current edition simply stops being current (isCurrent: false)
// but is untouched otherwise - it and everything under it (events, results,
// photos, documents) stays exactly as it was and remains browsable at its
// own permanent URL, linked from the tournament page's archive list.
export async function createSeasonAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = seasonInputSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    hostSchoolId: formData.get("hostSchoolId") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: parsed.data.tournamentId } });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const existingSlug = await prisma.season.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug) return { ok: false, error: "A season with that URL slug already exists." };

  const [season] = await prisma.$transaction([
    prisma.season.create({ data: parsed.data }),
    prisma.season.updateMany({
      where: { tournamentId: parsed.data.tournamentId, isCurrent: true },
      data: { isCurrent: false },
    }),
  ]);

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "SEASON_CREATE",
    entityType: "Season",
    entityId: season.id,
    summary: `${admin.name} started a new season ("${season.name}") for "${tournament.name}", archiving the previous one`,
    after: parsed.data,
  });

  revalidatePath(`/tournaments/${tournament.slug}`);
  revalidatePath("/dashboard/admin/tournaments");
  revalidatePath("/");
  return { ok: true };
}

export async function updateSeasonAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  const existing = await prisma.season.findUnique({ where: { id: seasonId }, include: { tournament: true } });
  if (!existing) return { ok: false, error: "Season not found." };

  const parsed = seasonInputSchema.omit({ slug: true, tournamentId: true }).safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    hostSchoolId: formData.get("hostSchoolId") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  await prisma.season.update({ where: { id: seasonId }, data: parsed.data });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "SEASON_UPDATE",
    entityType: "Season",
    entityId: seasonId,
    summary: `${admin.name} updated season "${parsed.data.name}"`,
    before: existing,
    after: parsed.data,
  });

  revalidatePath(`/seasons/${existing.slug}`);
  revalidatePath(`/tournaments/${existing.tournament.slug}`);
  return { ok: true };
}
