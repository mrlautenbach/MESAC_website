"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { createUserSchema, passwordSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/actions/auth";

function randomTempPassword(): string {
  // 16 random bytes, base36-ish, easy enough to read aloud/share with a
  // school office over the phone, still well above the 10-char minimum.
  return Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 8)).join("-");
}

export async function createUserAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult & { tempPassword?: string }> {
  const admin = await requireAdmin();

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    schoolId: formData.get("schoolId") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;
  if (data.role === "EDITOR" && !data.schoolId) {
    return { ok: false, error: "Select a school for an editor account." };
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { ok: false, error: "An account with that email already exists." };

  const tempPassword = randomTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      schoolId: data.role === "EDITOR" ? data.schoolId : null,
      passwordHash,
      mustChangePassword: true,
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "USER_CREATE",
    entityType: "User",
    entityId: user.id,
    schoolId: user.schoolId,
    summary: `${admin.name} created ${data.role.toLowerCase()} account for ${user.email}`,
    after: { email: user.email, role: user.role, schoolId: user.schoolId },
  });

  revalidatePath("/dashboard/admin/users");
  return { ok: true, tempPassword };
}

export async function resetPasswordAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult & { tempPassword?: string }> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const manualPassword = String(formData.get("newPassword") ?? "");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };

  let newPassword = manualPassword;
  if (!newPassword) {
    newPassword = randomTempPassword();
  } else {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password." };
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
      tokenVersion: { increment: 1 },
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: target.id,
    schoolId: target.schoolId,
    summary: `${admin.name} reset the password for ${target.email}`,
  });

  revalidatePath("/dashboard/admin/users");
  return { ok: true, tempPassword: manualPassword ? undefined : newPassword };
}

export async function setUserDisabledAction(userId: string, isDisabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  if (target.id === admin.id && isDisabled) {
    return { ok: false, error: "You can't disable your own account." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isDisabled, tokenVersion: { increment: 1 } },
  });

  await recordAudit({
    actorId: admin.id,
    actorLabel: admin.name,
    action: isDisabled ? "USER_DISABLE" : "USER_ENABLE",
    entityType: "User",
    entityId: target.id,
    schoolId: target.schoolId,
    summary: `${admin.name} ${isDisabled ? "disabled" : "re-enabled"} the account for ${target.email}`,
  });

  revalidatePath("/dashboard/admin/users");
  return { ok: true };
}
