"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { activityFieldInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";
import { z } from "zod";

export async function createActivityFieldAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = activityFieldInputSchema.safeParse({
    activityId: formData.get("activityId"),
    key: formData.get("key"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const activity = await prisma.activity.findUnique({ where: { id: parsed.data.activityId } });
  if (!activity) return { ok: false, error: "Activity not found." };

  const existing = await prisma.activityField.findUnique({
    where: { activityId_key: { activityId: parsed.data.activityId, key: parsed.data.key } },
  });
  if (existing) return { ok: false, error: `"${parsed.data.key}" is already a field on this activity.` };

  const count = await prisma.activityField.count({ where: { activityId: parsed.data.activityId } });
  const field = await prisma.activityField.create({
    data: { activityId: parsed.data.activityId, key: parsed.data.key, label: parsed.data.label, order: count },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACTIVITY_FIELD_CREATE",
    entityType: "ActivityField",
    entityId: field.id,
    summary: `${admin.name} added a custom schedule field "${field.label}" (${field.key}) to ${activity.name}`,
    after: { key: field.key, label: field.label },
  });

  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

const updateFieldSchema = z.object({
  fieldId: z.string().cuid(),
  label: z.string().trim().min(1).max(60),
});

export async function updateActivityFieldAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = updateFieldSchema.safeParse({
    fieldId: formData.get("fieldId"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const field = await prisma.activityField.findUnique({ where: { id: parsed.data.fieldId } });
  if (!field) return { ok: false, error: "Field not found." };

  await prisma.activityField.update({ where: { id: field.id }, data: { label: parsed.data.label } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACTIVITY_FIELD_UPDATE",
    entityType: "ActivityField",
    entityId: field.id,
    summary: `${admin.name} renamed a custom schedule field ("${field.key}")`,
    before: { label: field.label },
    after: { label: parsed.data.label },
  });

  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

export async function deleteActivityFieldAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const fieldId = formData.get("fieldId");
  if (typeof fieldId !== "string") return { ok: false, error: "Invalid input." };

  const field = await prisma.activityField.findUnique({ where: { id: fieldId }, include: { activity: true } });
  if (!field) return { ok: false, error: "Field not found." };

  await prisma.activityField.delete({ where: { id: field.id } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "ACTIVITY_FIELD_DELETE",
    entityType: "ActivityField",
    entityId: field.id,
    summary: `${admin.name} removed the custom schedule field "${field.label}" (${field.key}) from ${field.activity.name}`,
    before: { key: field.key, label: field.label },
  });

  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}
