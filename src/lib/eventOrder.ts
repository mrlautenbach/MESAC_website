import type { Prisma } from "@/generated/prisma";

// The number in a game_id ("G12" -> 12, "SF3" -> 3), or null when it has
// none. Mirrored by the backfill in the event_game_number migration.
export function gameNumberOf(gameId: string | null): number | null {
  const digits = gameId?.match(/\d+/)?.[0];
  return digits ? Number(digits.slice(0, 9)) : null;
}

// Games at the same time list in game order: G1, G2, ... G10.
const BY_GAME_NUMBER: Prisma.EventOrderByWithRelationInput = { gameNumber: { sort: "asc", nulls: "last" } };

// A tournament's schedule: the CSV's explicit order column first, then time.
export const SCHEDULE_ORDER: Prisma.EventOrderByWithRelationInput[] = [
  { order: { sort: "asc", nulls: "last" } },
  { date: "asc" },
  BY_GAME_NUMBER,
];

export const EARLIEST_FIRST: Prisma.EventOrderByWithRelationInput[] = [{ date: "asc" }, BY_GAME_NUMBER];

// Most recent first - but games at the same time still read G1, G2, ...
export const LATEST_FIRST: Prisma.EventOrderByWithRelationInput[] = [{ date: "desc" }, BY_GAME_NUMBER];
