import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

export type CredentialCheckResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "locked" | "disabled" };

// Single source of truth for verifying a login attempt: used by both
// NextAuth's authorize() (to actually establish the session) and by
// loginAction (to return a precise, correctly-worded error message —
// NextAuth's Credentials provider discards custom error text from
// authorize(), so that check has to happen here instead).
export async function checkCredentials(email: string, password: string): Promise<CredentialCheckResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Dummy hash comparison so a nonexistent-email response takes about as
    // long as a wrong-password response.
    await bcrypt.compare(password, "$2b$10$invalidsaltinvalidsaltin.invalidhasheeeeeeeeeeeeeeeeee");
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, reason: "locked" };
  }

  if (user.isDisabled) {
    return { ok: false, reason: "disabled" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    return { ok: false, reason: attempts >= LOCKOUT_THRESHOLD ? "locked" : "invalid" };
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  return { ok: true, user };
}
