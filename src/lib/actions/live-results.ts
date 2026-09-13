"use server";

import { revalidatePath } from "next/cache";
import { revalidateTournament } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { processAndStorePhoto, deleteStoredPhoto, PhotoValidationError } from "@/lib/photo-upload";
import type { ActionResult } from "@/lib/actions/auth";

async function loadTournament(tournamentId: string) {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: { select: { slug: true } } },
  });
}

export async function uploadLiveResultsPhotoAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };

  let processed;
  try {
    processed = await processAndStorePhoto(file, `tournaments/${tournamentId}/live-results`);
  } catch (error) {
    if (error instanceof PhotoValidationError) return { ok: false, error: error.message };
    console.error("Live results photo upload failed", error);
    return { ok: false, error: "Something went wrong uploading that photo. Please try again in a moment." };
  }

  const previousPathname = tournament.liveResultsPhotoBlobPathname;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { liveResultsPhotoUrl: processed.url, liveResultsPhotoBlobPathname: processed.pathname },
  });
  if (previousPathname) await deleteStoredPhoto(previousPathname).catch(() => {});

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_LIVE_RESULTS_PHOTO_UPLOAD",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} uploaded a live results photo for "${tournament.name}"`,
    after: { liveResultsPhotoUrl: processed.url },
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

export async function deleteLiveResultsPhotoAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const tournament = await loadTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (!tournament.liveResultsPhotoUrl) return { ok: true };

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { liveResultsPhotoUrl: null, liveResultsPhotoBlobPathname: null },
  });
  if (tournament.liveResultsPhotoBlobPathname) {
    await deleteStoredPhoto(tournament.liveResultsPhotoBlobPathname).catch(() => {});
  }

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_LIVE_RESULTS_PHOTO_DELETE",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} removed the live results photo for "${tournament.name}"`,
    before: { liveResultsPhotoUrl: tournament.liveResultsPhotoUrl },
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}
