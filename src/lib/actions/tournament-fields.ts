"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { tournamentFieldInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";
import { z } from "zod";

export async function createTournamentFieldAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = tournamentFieldInputSchema.safeParse({
    tournamentId: formData.get("tournamentId"),
    key: formData.get("key"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: parsed.data.tournamentId } });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const existing = await prisma.tournamentField.findUnique({
    where: { tournamentId_key: { tournamentId: parsed.data.tournamentId, key: parsed.data.key } },
  });
  if (existing) return { ok: false, error: `"${parsed.data.key}" is already a field on this tournament.` };

  const count = await prisma.tournamentField.count({ where: { tournamentId: parsed.data.tournamentId } });
  const field = await prisma.tournamentField.create({
    data: { tournamentId: parsed.data.tournamentId, key: parsed.data.key, label: parsed.data.label, order: count },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_FIELD_CREATE",
    entityType: "TournamentField",
    entityId: field.id,
    summary: `${admin.name} added a custom schedule field "${field.label}" (${field.key}) to ${tournament.name}`,
    after: { key: field.key, label: field.label },
  });

  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

const updateFieldSchema = z.object({
  fieldId: z.string().cuid(),
  label: z.string().trim().min(1).max(60),
});

export async function updateTournamentFieldAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = updateFieldSchema.safeParse({
    fieldId: formData.get("fieldId"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const field = await prisma.tournamentField.findUnique({ where: { id: parsed.data.fieldId } });
  if (!field) return { ok: false, error: "Field not found." };

  await prisma.tournamentField.update({ where: { id: field.id }, data: { label: parsed.data.label } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_FIELD_UPDATE",
    entityType: "TournamentField",
    entityId: field.id,
    summary: `${admin.name} renamed a custom schedule field ("${field.key}")`,
    before: { label: field.label },
    after: { label: parsed.data.label },
  });

  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

export async function deleteTournamentFieldAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const fieldId = formData.get("fieldId");
  if (typeof fieldId !== "string") return { ok: false, error: "Invalid input." };

  const field = await prisma.tournamentField.findUnique({ where: { id: fieldId }, include: { tournament: true } });
  if (!field) return { ok: false, error: "Field not found." };

  await prisma.tournamentField.delete({ where: { id: field.id } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_FIELD_DELETE",
    entityType: "TournamentField",
    entityId: field.id,
    summary: `${admin.name} removed the custom schedule field "${field.label}" (${field.key}) from ${field.tournament.name}`,
    before: { key: field.key, label: field.label },
  });

  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}
