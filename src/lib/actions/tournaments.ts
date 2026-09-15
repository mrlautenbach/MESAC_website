"use server";

import { revalidatePath } from "next/cache";
import { revalidateTournament } from "@/lib/revalidate";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { tournamentInputSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";

// Creating a new edition for an activity is the "archive" action: the
// previous current edition simply stops being current (isCurrent: false)
// but is untouched otherwise - it and everything under it (events, results,
// photos, documents) stays exactly as it was and remains browsable at its
// own permanent URL, linked from the activity page's archive list.
export async function createTournamentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireUser();

  const parsed = tournamentInputSchema.safeParse({
    activityId: formData.get("activityId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    hostSchoolId: formData.get("hostSchoolId") || null,
    archived: formData.get("archived") === "on",
    liveResultsUrl: formData.get("liveResultsUrl") ?? "",
    liveResultsText: formData.get("liveResultsText") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  const activity = await prisma.activity.findUnique({
    where: { id: parsed.data.activityId },
    include: { divisions: { where: { tournamentId: null } } },
  });
  if (!activity) return { ok: false, error: "Activity not found." };

  const existingSlug = await prisma.tournament.findUnique({ where: { slug: parsed.data.slug } });
  if (existingSlug) return { ok: false, error: "A tournament with that URL slug already exists." };

  const [tournament] = await prisma.$transaction([
    prisma.tournament.create({
      data: {
        ...parsed.data,
        liveResultsUrl: parsed.data.liveResultsUrl || null,
        liveResultsText: parsed.data.liveResultsText || null,
      },
    }),
    prisma.tournament.updateMany({
      where: { activityId: parsed.data.activityId, isCurrent: true },
      data: { isCurrent: false },
    }),
  ]);

  // Give the new tournament its own independent copy of the activity's
  // current default divisions - editing them from here on (adding a
  // division, removing one) never touches the default template or any
  // other edition of this activity.
  if (activity.divisions.length > 0) {
    await prisma.division.createMany({
      data: activity.divisions.map((d) => ({
        activityId: activity.id,
        tournamentId: tournament.id,
        name: d.name,
        slug: d.slug,
      })),
    });
  }

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_CREATE",
    entityType: "Tournament",
    entityId: tournament.id,
    summary: `${admin.name} started a new tournament ("${tournament.name}") for "${activity.name}", archiving the previous one`,
    after: parsed.data,
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: activity.slug });
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

export async function updateTournamentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireUser();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { activity: true } });
  if (!existing) return { ok: false, error: "Tournament not found." };

  const parsed = tournamentInputSchema.omit({ slug: true, activityId: true }).safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    hostSchoolId: formData.get("hostSchoolId") || null,
    archived: formData.get("archived") === "on",
    liveResultsUrl: formData.get("liveResultsUrl") ?? "",
    liveResultsText: formData.get("liveResultsText") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return { ok: false, error: "End date must be after the start date." };
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      ...parsed.data,
      liveResultsUrl: parsed.data.liveResultsUrl || null,
      liveResultsText: parsed.data.liveResultsText || null,
    },
  });

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

  revalidateTournament({ slug: existing.slug, activitySlug: existing.activity.slug });
  return { ok: true };
}

// Promotes an archived edition back to being the activity's current one
// (and un-marks whichever edition held that spot before) - the only way to
// recover from an edition ending up in the archive list by mistake (e.g. an
// empty tournament accidentally created after it), since every other
// tournament control only ever appears for whichever one is already
// current.
export async function setTournamentCurrentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireUser();
  const tournamentId = String(formData.get("tournamentId") ?? "");

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { activity: true } });
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.isCurrent) return { ok: true };

  await prisma.$transaction([
    prisma.tournament.updateMany({
      where: { activityId: tournament.activityId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.tournament.update({ where: { id: tournamentId }, data: { isCurrent: true } }),
  ]);

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_SET_CURRENT",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} made "${tournament.name}" the current tournament for "${tournament.activity.name}"`,
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

// Permanently removes one tournament edition and everything under it -
// events, meet program/results, divisions, team photos, participation
// overrides - cascaded by the schema, without touching the activity or its
// other editions. The admin must type the tournament's exact name to
// confirm, same guard as deleting a whole activity. If this was the
// activity's current edition, the next-most-recent remaining one (if any)
// is promoted to current so the activity page doesn't lose its default
// tournament.
export async function deleteTournamentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: { activity: true } });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  if (confirmName !== tournament.name) {
    return { ok: false, error: `Type "${tournament.name}" exactly to confirm deletion.` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.tournament.delete({ where: { id: tournamentId } });

    if (tournament.isCurrent) {
      const nextCurrent = await tx.tournament.findFirst({
        where: { activityId: tournament.activityId },
        orderBy: { startDate: "desc" },
      });
      if (nextCurrent) {
        await tx.tournament.update({ where: { id: nextCurrent.id }, data: { isCurrent: true } });
      }
    }
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_DELETE",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} permanently deleted tournament "${tournament.name}" (${tournament.activity.name}) and everything under it`,
    before: { name: tournament.name, activity: tournament.activity.name },
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}

// The participation roster for one tournament. The form posts every school in
// the system, with the participating ones checked, so this writes an explicit
// row per school rather than diffing - after a save the roster is fully
// pinned down and no longer shifts if a school's league membership changes
// later.
export async function syncTournamentSchoolsAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const admin = await requireUser();
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const offered = formData.getAll("schoolIds").map((v) => String(v));
  const checked = new Set(formData.getAll("participatingSchoolIds").map((v) => String(v)));

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { activity: { select: { slug: true } } },
  });
  if (!tournament) return { ok: false, error: "Tournament not found." };

  // Guard against a stale form naming a school that has since been deleted.
  const known = await prisma.school.findMany({
    where: { id: { in: offered } },
    select: { id: true, name: true },
  });
  if (known.length === 0) return { ok: false, error: "No schools to save." };

  await prisma.$transaction(
    known.map((school) =>
      prisma.tournamentSchool.upsert({
        where: { tournamentId_schoolId: { tournamentId, schoolId: school.id } },
        create: { tournamentId, schoolId: school.id, participating: checked.has(school.id) },
        update: { participating: checked.has(school.id) },
      })
    )
  );

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "TOURNAMENT_SCHOOLS_UPDATE",
    entityType: "Tournament",
    entityId: tournamentId,
    summary: `${admin.name} set the participating schools for "${tournament.name}"`,
    after: { participating: known.filter((s) => checked.has(s.id)).map((s) => s.name) },
  });

  revalidateTournament({ slug: tournament.slug, activitySlug: tournament.activity.slug });
  revalidatePath(`/seasons/${tournament.slug}/team-photos`);
  revalidatePath("/dashboard/admin/tournaments");
  return { ok: true };
}
