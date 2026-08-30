"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { tournamentInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createTournamentAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = tournamentInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    sport: formData.get("sport"),
    scoringType: formData.get("scoringType") || "WIN_LOSS",
    winPoints: formData.get("winPoints") || 3,
    drawPoints: formData.get("drawPoints") || 1,
    lossPoints: formData.get("lossPoints") || 0,
    divisionNames: formData.getAll("divisionNames"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const existing = await prisma.tournament.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { ok: false, error: "A tournament with that URL slug already exists." };

  const tournament = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      sport: parsed.data.sport,
      scoringType: parsed.data.scoringType,
      winPoints: parsed.data.winPoints,
      drawPoints: parsed.data.drawPoints,
      lossPoints: parsed.data.lossPoints,
      divisions: {
        create: parsed.data.divisionNames.map((name) => ({ name, slug: slugify(name) })),
      },
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_CREATE",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} created tournament "${tournament.name}"`,
    after: { name: tournament.name, scoringType: tournament.scoringType, divisions: parsed.data.divisionNames },
  });

  revalidatePath("/dashboard/admin/tournaments");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTournamentAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!existing) return { ok: false, error: "Tournament not found." };

  const parsed = tournamentInputSchema.omit({ slug: true, divisionNames: true }).safeParse({
    name: formData.get("name"),
    sport: formData.get("sport"),
    scoringType: formData.get("scoringType") || "WIN_LOSS",
    winPoints: formData.get("winPoints") || 3,
    drawPoints: formData.get("drawPoints") || 1,
    lossPoints: formData.get("lossPoints") || 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
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

  revalidatePath(`/tournaments/${existing.slug}`);
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

export async function addDivisionAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 40) return { ok: false, error: "Enter a division name (up to 40 characters)." };

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const slug = slugify(name);
  const existing = await prisma.division.findUnique({ where: { tournamentId_slug: { tournamentId, slug } } });
  if (existing) return { ok: false, error: "That division already exists." };

  const division = await prisma.division.create({ data: { tournamentId, name, slug } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "DIVISION_CREATE",
    entityType: "Division",
    entityId: division.id,
    summary: `${admin.name} added division "${name}" to "${tournament.name}"`,
    after: { name },
  });

  revalidatePath(`/dashboard/admin/tournaments`);
  return { ok: true };
}
