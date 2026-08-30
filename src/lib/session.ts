import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  role: "ADMIN" | "EDITOR";
  schoolId: string | null;
  name: string;
  email: string;
  mustChangePassword: boolean;
};

// Every page and server action should call this instead of `auth()`
// directly. It collapses a disabled account / revoked session (see
// lib/auth.ts jwt callback) down to "not logged in".
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.isValid) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    schoolId: session.user.schoolId,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    mustChangePassword: session.user.mustChangePassword,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

// Throws unless the user is an admin OR an editor scoped to `schoolId`.
export async function requireSchoolAccess(schoolId: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (user.role === "EDITOR" && user.schoolId === schoolId) return user;
  throw new Error("FORBIDDEN");
}
