"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { recordInputSchema, hallOfFameInputSchema } from "@/lib/validation";
import { processAndStorePhoto, PhotoValidationError } from "@/lib/photo-upload";
import type { ActionResult } from "@/lib/actions/auth";

export async function createRecordAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = recordInputSchema.safeParse({
    sport: formData.get("sport"),
    eventName: formData.get("eventName"),
    mark: formData.get("mark"),
    athleteName: formData.get("athleteName"),
    schoolId: formData.get("schoolId") || null,
    year: formData.get("year"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const record = await prisma.record.create({ data: parsed.data });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "RECORD_CREATE",
    entityType: "Record",
    entityId: record.id,
    summary: `${admin.name} added a league record: ${record.eventName} (${record.mark})`,
    after: parsed.data,
  });

  revalidatePath("/records");
  revalidatePath("/dashboard/admin/records");
  return { ok: true };
}

export async function deleteRecordAction(recordId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const record = await prisma.record.findUnique({ where: { id: recordId } });
  if (!record) return { ok: false, error: "Record not found." };

  await prisma.record.delete({ where: { id: recordId } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "RECORD_DELETE",
    entityType: "Record",
    entityId: recordId,
    summary: `${admin.name} deleted a league record: ${record.eventName}`,
    before: { eventName: record.eventName, mark: record.mark },
  });

  revalidatePath("/records");
  revalidatePath("/dashboard/admin/records");
  return { ok: true };
}

export async function createHallOfFameAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = hallOfFameInputSchema.safeParse({
    name: formData.get("name"),
    schoolId: formData.get("schoolId") || null,
    classYear: formData.get("classYear"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  let photoUrl: string | null = null;
  let blobPathname: string | null = null;
  const photoFile = formData.get("photo");
  if (photoFile instanceof File && photoFile.size > 0) {
    try {
      const processed = await processAndStorePhoto(photoFile, "hall-of-fame");
      photoUrl = processed.url;
      blobPathname = processed.pathname;
    } catch (error) {
      if (error instanceof PhotoValidationError) return { ok: false, error: error.message };
      console.error("Hall of Fame photo upload failed", error);
      return { ok: false, error: "Something went wrong uploading that photo. Please try again in a moment." };
    }
  }

  const entry = await prisma.hallOfFameEntry.create({
    data: { ...parsed.data, photoUrl, blobPathname },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "HOF_CREATE",
    entityType: "HallOfFameEntry",
    entityId: entry.id,
    summary: `${admin.name} added ${entry.name} to the Hall of Fame`,
    after: { name: entry.name, classYear: entry.classYear },
  });

  revalidatePath("/records");
  revalidatePath("/dashboard/admin/records");
  return { ok: true };
}

export async function deleteHallOfFameAction(entryId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const entry = await prisma.hallOfFameEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, error: "Entry not found." };

  await prisma.hallOfFameEntry.delete({ where: { id: entryId } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "HOF_DELETE",
    entityType: "HallOfFameEntry",
    entityId: entryId,
    summary: `${admin.name} removed ${entry.name} from the Hall of Fame`,
    before: { name: entry.name },
  });

  revalidatePath("/records");
  revalidatePath("/dashboard/admin/records");
  return { ok: true };
}
