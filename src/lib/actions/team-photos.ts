"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { processAndStorePhoto, deleteStoredPhoto, PhotoValidationError } from "@/lib/photo-upload";
import type { ActionResult } from "@/lib/actions/auth";

// Prisma's generated compound-unique input for a key that includes a
// nullable column (divisionId) doesn't accept `null` in its TS type, even
// though the underlying constraint supports it - so slots are looked up
// with a plain findFirst/create-or-update instead of upsert-by-compound-key.
async function findSlot(tournamentId: string, schoolId: string, divisionId: string | null) {
  return prisma.teamPhoto.findFirst({ where: { tournamentId, schoolId, divisionId } });
}

async function loadTournamentForRevalidate(tournamentId: string) {
  return prisma.tournament.findUnique({ where: { id: tournamentId }, select: { slug: true } });
}

export async function setTeamPhotoEnabledAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const schoolId = String(formData.get("schoolId") ?? "");
  const divisionId = (formData.get("divisionId") as string) || null;
  const enabled = formData.get("enabled") === "on";

  const tournament = await loadTournamentForRevalidate(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const existing = await findSlot(tournamentId, schoolId, divisionId);
  if (existing) {
    await prisma.teamPhoto.update({ where: { id: existing.id }, data: { enabled } });
  } else {
    await prisma.teamPhoto.create({ data: { tournamentId, schoolId, divisionId, enabled } });
  }

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TEAM_PHOTO_SLOT_TOGGLE",
    entityType: "TeamPhoto",
    entityId: `${tournamentId}:${schoolId}:${divisionId ?? "none"}`,
    summary: `${admin.name} turned ${enabled ? "on" : "off"} a team photo slot`,
    after: { enabled },
  });

  revalidatePath(`/seasons/${tournament.slug}/team-photos`);
  revalidatePath(`/dashboard/admin/tournament-photos/${tournamentId}`);
  return { ok: true };
}

export async function uploadTeamPhotoAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const schoolId = String(formData.get("schoolId") ?? "");
  const divisionId = (formData.get("divisionId") as string) || null;

  const tournament = await loadTournamentForRevalidate(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };

  const existing = await findSlot(tournamentId, schoolId, divisionId);

  let processed;
  try {
    processed = await processAndStorePhoto(file, `team-photos/${tournamentId}`);
  } catch (error) {
    if (error instanceof PhotoValidationError) return { ok: false, error: error.message };
    console.error("Team photo upload failed", error);
    return { ok: false, error: "Something went wrong uploading that photo. Please try again in a moment." };
  }

  if (existing) {
    await prisma.teamPhoto.update({
      where: { id: existing.id },
      data: { enabled: true, photoUrl: processed.url, blobPathname: processed.pathname },
    });
  } else {
    await prisma.teamPhoto.create({
      data: { tournamentId, schoolId, divisionId, enabled: true, photoUrl: processed.url, blobPathname: processed.pathname },
    });
  }

  if (existing?.blobPathname) {
    await deleteStoredPhoto(existing.blobPathname).catch(() => {});
  }

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TEAM_PHOTO_UPLOAD",
    entityType: "TeamPhoto",
    entityId: `${tournamentId}:${schoolId}:${divisionId ?? "none"}`,
    summary: `${admin.name} uploaded a team photo`,
    after: { photoUrl: processed.url },
  });

  revalidatePath(`/seasons/${tournament.slug}/team-photos`);
  revalidatePath(`/dashboard/admin/tournament-photos/${tournamentId}`);
  return { ok: true };
}

export async function deleteTeamPhotoAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const schoolId = String(formData.get("schoolId") ?? "");
  const divisionId = (formData.get("divisionId") as string) || null;

  const tournament = await loadTournamentForRevalidate(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const existing = await findSlot(tournamentId, schoolId, divisionId);
  if (!existing?.photoUrl) return { ok: true };

  await prisma.teamPhoto.update({ where: { id: existing.id }, data: { photoUrl: null, blobPathname: null } });
  if (existing.blobPathname) {
    await deleteStoredPhoto(existing.blobPathname).catch(() => {});
  }

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TEAM_PHOTO_DELETE",
    entityType: "TeamPhoto",
    entityId: `${tournamentId}:${schoolId}:${divisionId ?? "none"}`,
    summary: `${admin.name} removed a team photo`,
    before: { photoUrl: existing.photoUrl },
  });

  revalidatePath(`/seasons/${tournament.slug}/team-photos`);
  revalidatePath(`/dashboard/admin/tournament-photos/${tournamentId}`);
  return { ok: true };
}

export async function setTournamentGenderVisibilityAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const showGirlsTeamPhotos = formData.get("showGirlsTeamPhotos") === "on";
  const showBoysTeamPhotos = formData.get("showBoysTeamPhotos") === "on";

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  await prisma.tournament.update({ where: { id: tournamentId }, data: { showGirlsTeamPhotos, showBoysTeamPhotos } });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TEAM_PHOTO_GENDER_VISIBILITY_UPDATE",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} updated team photo gender visibility for "${tournament.name}"`,
    before: { showGirlsTeamPhotos: tournament.showGirlsTeamPhotos, showBoysTeamPhotos: tournament.showBoysTeamPhotos },
    after: { showGirlsTeamPhotos, showBoysTeamPhotos },
  });

  revalidatePath(`/seasons/${tournament.slug}/team-photos`);
  revalidatePath(`/dashboard/admin/tournament-photos/${tournamentId}`);
  return { ok: true };
}
