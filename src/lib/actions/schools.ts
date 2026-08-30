"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { schoolInputSchema, slugSchema } from "@/lib/validation";
import { processAndStorePhoto } from "@/lib/photo-upload";
import { PhotoValidationError } from "@/lib/photo-upload";
import type { ActionResult } from "@/lib/actions/auth";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function geoFields(data: { code?: string; city?: string; lat?: number | ""; lon?: number | "" }) {
  return {
    code: data.code || null,
    city: data.city || null,
    lat: data.lat === "" || data.lat === undefined ? null : data.lat,
    lon: data.lon === "" || data.lon === undefined ? null : data.lon,
  };
}

export async function createSchoolAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = schoolInputSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    code: formData.get("code") ?? "",
    city: formData.get("city") ?? "",
    lat: formData.get("lat") || "",
    lon: formData.get("lon") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let slug = slugify(parsed.data.name);
  const slugCheck = slugSchema.safeParse(slug);
  if (!slugCheck.success) slug = `school-${Date.now()}`;

  const existing = await prisma.school.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  let logoUrl: string | null = null;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      const processed = await processAndStorePhoto(logoFile, `school-logos/${slug}`);
      logoUrl = processed.url;
    } catch (error) {
      if (error instanceof PhotoValidationError) return { ok: false, error: error.message };
      console.error("Logo upload failed", error);
      return { ok: false, error: "Something went wrong uploading that logo. Please try again in a moment." };
    }
  }

  const school = await prisma.school.create({
    data: {
      name: parsed.data.name,
      slug,
      logoUrl,
      contactName: parsed.data.contactName || null,
      contactEmail: parsed.data.contactEmail || null,
      contactPhone: parsed.data.contactPhone || null,
      ...geoFields(parsed.data),
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "SCHOOL_CREATE",
    entityType: "School",
    entityId: school.id,
    summary: `${admin.name} added school "${school.name}"`,
    after: { name: school.name },
  });

  revalidatePath("/dashboard/admin/schools");
  revalidatePath("/schools");
  return { ok: true };
}

export async function updateSchoolAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const schoolId = String(formData.get("schoolId") ?? "");
  const existing = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!existing) return { ok: false, error: "School not found." };

  const parsed = schoolInputSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    code: formData.get("code") ?? "",
    city: formData.get("city") ?? "",
    lat: formData.get("lat") || "",
    lon: formData.get("lon") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let logoUrl = existing.logoUrl;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      const processed = await processAndStorePhoto(logoFile, `school-logos/${existing.slug}`);
      logoUrl = processed.url;
    } catch (error) {
      if (error instanceof PhotoValidationError) return { ok: false, error: error.message };
      throw error;
    }
  }

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      name: parsed.data.name,
      logoUrl,
      contactName: parsed.data.contactName || null,
      contactEmail: parsed.data.contactEmail || null,
      contactPhone: parsed.data.contactPhone || null,
      ...geoFields(parsed.data),
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "SCHOOL_UPDATE",
    entityType: "School",
    entityId: schoolId,
    summary: `${admin.name} updated school "${parsed.data.name}"`,
    before: { name: existing.name },
    after: { name: parsed.data.name },
  });

  revalidatePath("/dashboard/admin/schools");
  revalidatePath("/schools");
  return { ok: true };
}
