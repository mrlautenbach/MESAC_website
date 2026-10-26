import type { CurrentUser } from "@/lib/session";

// A school editor can manage a tournament's team photos and its events'
// results when their school is hosting it, in addition to the games their
// school plays in.
export function isHostEditor(user: CurrentUser, hostSchoolId: string | null | undefined): boolean {
  return user.role === "EDITOR" && !!user.schoolId && user.schoolId === hostSchoolId;
}

// Whether a school editor is scoped to this event: they play in it, or host
// the tournament it belongs to. (Admins are checked separately.)
export function isScopedEventEditor(
  user: CurrentUser,
  event: { participants: { schoolId: string }[]; tournament: { hostSchoolId: string | null } }
): boolean {
  if (user.role !== "EDITOR" || !user.schoolId) return false;
  return (
    event.participants.some((p) => p.schoolId === user.schoolId) ||
    isHostEditor(user, event.tournament.hostSchoolId)
  );
}

// Prisma `where` for the events a user can manage on the dashboard.
export function manageableEventsWhere(user: CurrentUser) {
  if (user.role === "ADMIN") return {};
  const schoolId = user.schoolId ?? "";
  return { OR: [{ participants: { some: { schoolId } } }, { tournament: { hostSchoolId: schoolId } }] };
}
