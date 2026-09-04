"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { photoCaptionSchema } from "@/lib/validation";
import { processAndStorePhoto, deleteStoredPhoto, PhotoValidationError } from "@/lib/photo-upload";
import type { ActionResult } from "@/lib/actions/auth";

async function assertEventAccess(eventId: string) {
  const user = await requireUser();
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { participants: true, tournament: true },
  });
  if (!event) throw new Error("NOT_FOUND");

  const participantSchoolIds = event.participants.map((p) => p.schoolId);
  const isAdmin = user.role === "ADMIN";
  const isScopedEditor = user.role === "EDITOR" && !!user.schoolId && participantSchoolIds.includes(user.schoolId);
  if (!isAdmin && !isScopedEditor) throw new Error("FORBIDDEN");

  return { user, event, isAdmin };
}

export async function uploadPhotosAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const eventId = String(formData.get("eventId") ?? "");
  let ctx;
  try {
    ctx = await assertEventAccess(eventId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return { ok: false, error: "Event not found." };
    return { ok: false, error: "You don't have access to add photos to this event." };
  }
  const { user, event, isAdmin } = ctx;

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Choose at least one photo to upload." };
  if (files.length > 10) return { ok: false, error: "Upload at most 10 photos at a time." };

  const captions = formData.getAll("captions").map((c) => String(c));
  const altTexts = formData.getAll("altTexts").map((a) => String(a));

  const created: string[] = [];
  for (let i = 0; i < files.length; i++) {
    let processed;
    try {
      processed = await processAndStorePhoto(files[i], event.id);
    } catch (error) {
      const message =
        error instanceof PhotoValidationError
          ? error.message
          : "Something went wrong storing that photo. Please try again in a moment.";
      if (!(error instanceof PhotoValidationError)) {
        console.error("Photo upload failed", error);
      }
      return created.length > 0
        ? { ok: false, error: `Some photos were saved, but one failed: ${message}` }
        : { ok: false, error: message };
    }

    const photo = await prisma.photo.create({
      data: {
        eventId: event.id,
        url: processed.url,
        blobPathname: processed.pathname,
        width: processed.width,
        height: processed.height,
        caption: captions[i]?.trim() || null,
        altText: altTexts[i]?.trim() || null,
        uploadedById: user.id,
      },
    });
    created.push(photo.id);

    await recordAudit({
      actorId: user.id,
      actorLabel: user.name,
      action: "PHOTO_CREATE",
      entityType: "Photo",
      entityId: photo.id,
      schoolId: isAdmin ? null : user.schoolId,
      summary: `${user.name} added a photo to this event`,
      after: { caption: photo.caption },
    });
  }

  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updatePhotoCaptionAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = photoCaptionSchema.safeParse({
    photoId: formData.get("photoId"),
    caption: formData.get("caption") ?? "",
    altText: formData.get("altText") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const photo = await prisma.photo.findUnique({
    where: { id: parsed.data.photoId },
    include: { event: { include: { tournament: true } } },
  });
  if (!photo) return { ok: false, error: "Photo not found." };

  let ctx;
  try {
    ctx = await assertEventAccess(photo.eventId);
  } catch {
    return { ok: false, error: "You don't have access to edit this photo." };
  }
  const { user } = ctx;

  const before = { caption: photo.caption, altText: photo.altText };
  const after = { caption: parsed.data.caption || null, altText: parsed.data.altText || null };
  await prisma.photo.update({ where: { id: photo.id }, data: after });

  await recordAudit({
    actorId: user.id,
    actorLabel: user.name,
    action: "PHOTO_UPDATE",
    entityType: "Photo",
    entityId: photo.id,
    summary: `${user.name} updated a photo caption`,
    before,
    after,
  });

  revalidatePath(`/seasons/${photo.event.tournament.slug}/events/${photo.event.slug}`);
  return { ok: true };
}

export async function deletePhotoAction(photoId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const photo = await prisma.photo.findUnique({ where: { id: photoId }, include: { event: { include: { tournament: true } } } });
  if (!photo) return { ok: false, error: "Photo not found." };

  try {
    await deleteStoredPhoto(photo.blobPathname);
  } catch (error) {
    console.error("Failed to delete photo from storage", error);
  }
  await prisma.photo.delete({ where: { id: photo.id } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "PHOTO_DELETE",
    entityType: "Photo",
    entityId: photo.id,
    summary: `${admin.name} deleted a photo`,
    before: { caption: photo.caption, url: photo.url },
  });

  revalidatePath(`/seasons/${photo.event.tournament.slug}/events/${photo.event.slug}`);
  return { ok: true };
}
