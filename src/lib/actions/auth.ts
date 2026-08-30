"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { loginSchema, passwordSchema } from "@/lib/validation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkCredentials } from "@/lib/credentials";
import { getClientIp, isIpRateLimited } from "@/lib/rate-limit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const REASON_MESSAGES: Record<string, string> = {
  invalid: "Incorrect email or password.",
  locked: "This account is temporarily locked due to repeated failed logins. Try again in 15 minutes.",
  disabled: "This account has been disabled. Contact your league admin.",
};

export async function loginAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email and password." };
  }

  const ip = getClientIp(await headers());
  if (isIpRateLimited(ip)) {
    return { ok: false, error: "Too many login attempts from this network. Please wait a minute and try again." };
  }

  // Checked here (not just inside authorize()) so the user sees the actual
  // reason — Auth.js's Credentials provider discards custom error messages
  // thrown from authorize().
  const result = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return { ok: false, error: REASON_MESSAGES[result.reason] };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "Incorrect email or password." };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirect: false });
}

export async function changeOwnPasswordAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const parsed = passwordSchema.safeParse(formData.get("newPassword"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { ok: false, error: "Account not found." };

  const validCurrent = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!validCurrent) return { ok: false, error: "Current password is incorrect." };

  const passwordHash = await bcrypt.hash(parsed.data, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
  });

  return { ok: true };
}
