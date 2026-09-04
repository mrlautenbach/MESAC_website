"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { documentTitleSchema } from "@/lib/validation";
import { processAndStoreDocument, deleteStoredDocument, DocumentValidationError } from "@/lib/document-upload";
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

export async function uploadDocumentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const eventId = String(formData.get("eventId") ?? "");
  let ctx;
  try {
    ctx = await assertEventAccess(eventId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return { ok: false, error: "Event not found." };
    return { ok: false, error: "You don't have access to add documents to this event." };
  }
  const { user, event, isAdmin } = ctx;

  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF to upload." };
  }

  const titleParsed = documentTitleSchema.safeParse(formData.get("title") || file.name.replace(/\.pdf$/i, ""));
  const title = titleParsed.success ? titleParsed.data : "Results";

  let processed;
  try {
    processed = await processAndStoreDocument(file, event.id);
  } catch (error) {
    if (error instanceof DocumentValidationError) return { ok: false, error: error.message };
    console.error("Document upload failed", error);
    return { ok: false, error: "Something went wrong storing that file. Please try again in a moment." };
  }

  const document = await prisma.document.create({
    data: {
      eventId: event.id,
      url: processed.url,
      blobPathname: processed.pathname,
      title,
      uploadedById: user.id,
    },
  });

  await recordAudit({
    actorId: user.id,
    actorLabel: user.name,
    action: "DOCUMENT_CREATE",
    entityType: "Document",
    entityId: document.id,
    schoolId: isAdmin ? null : user.schoolId,
    summary: `${user.name} added a results document ("${title}") to this event`,
    after: { title },
  });

  revalidatePath(`/seasons/${event.tournament.slug}/events/${event.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { event: { include: { tournament: true } } },
  });
  if (!document) return { ok: false, error: "Document not found." };

  try {
    await deleteStoredDocument(document.blobPathname);
  } catch (error) {
    console.error("Failed to delete document from storage", error);
  }
  await prisma.document.delete({ where: { id: document.id } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "DOCUMENT_DELETE",
    entityType: "Document",
    entityId: document.id,
    summary: `${admin.name} deleted a results document ("${document.title}")`,
    before: { title: document.title, url: document.url },
  });

  revalidatePath(`/seasons/${document.event.tournament.slug}/events/${document.event.slug}`);
  return { ok: true };
}
