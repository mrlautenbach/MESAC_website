import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const emailSchema = z.string().trim().toLowerCase().email().max(200);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only");

export const schoolInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  code: z.string().trim().max(12).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  lat: z.union([z.coerce.number().min(-90).max(90), z.literal("")]).optional(),
  lon: z.union([z.coerce.number().min(-180).max(180), z.literal("")]).optional(),
});

export const scoringTypeSchema = z.enum(["WIN_LOSS", "LOW_SCORE", "NONE"]);

// An Activity is the stable, recurring identity of one sport/activity (e.g.
// "JV Volleyball") - its format doesn't change year to year, and it always
// runs in the same Season (Season 1/2/3).
export const activityInputSchema = z.object({
  seasonId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  sport: z.string().trim().min(1).max(60),
  scoringType: scoringTypeSchema,
  winPoints: z.coerce.number().int().min(0).max(100),
  drawPoints: z.coerce.number().int().min(0).max(100),
  lossPoints: z.coerce.number().int().min(0).max(100),
  // Comma-separated in the form (e.g. "Girls,Boys"); empty for an
  // ungendered/single activity (meets, festivals, baseball, softball).
  divisionNames: z.array(z.string().trim().min(1).max(40)).max(4).optional().default([]),
});

// The CSV/schedule columns every activity already has as real Event
// columns - a custom ActivityField can't reuse one of these keys.
export const RESERVED_FIELD_KEYS = new Set([
  "game_id",
  "gender",
  "home",
  "home_score",
  "away",
  "away_score",
  "date",
  "time",
  "court",
  "status",
  "streaming_link",
  "title",
]);

export const activityFieldKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores, starting with a letter")
  .refine((key) => !RESERVED_FIELD_KEYS.has(key), "That key is already one of the standard schedule fields");

export const activityFieldInputSchema = z.object({
  activityId: z.string().cuid(),
  key: activityFieldKeySchema,
  label: z.string().trim().min(1).max(60),
});

// A Tournament is one year's edition of an Activity - its own dates and host.
export const tournamentInputSchema = z.object({
  activityId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  hostSchoolId: z.string().cuid().optional().nullable(),
});

export const streamUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Stream link must start with http:// or https://")
  .optional()
  .or(z.literal(""));

export const eventInputSchema = z.object({
  tournamentId: z.string().cuid(),
  divisionId: z.string().cuid().optional().nullable(),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  date: z.coerce.date(),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]),
  streamUrl: streamUrlSchema,
  schoolIds: z.array(z.string().cuid()).min(1, "Select at least one school").max(12),
});

export const resultEntrySchema = z.object({
  schoolId: z.string().cuid(),
  score: z
    .union([z.coerce.number().int().min(0).max(9999), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  outcome: z.enum(["WIN", "LOSS", "DRAW", ""]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
});

export const individualResultEntrySchema = z.object({
  athleteName: z.string().trim().min(1).max(120),
  score: z.coerce.number().int().min(0).max(999),
});

export const photoCaptionSchema = z.object({
  photoId: z.string().cuid(),
  caption: z.string().trim().max(300).optional().or(z.literal("")),
  altText: z.string().trim().max(300).optional().or(z.literal("")),
});

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15MB pre-processing cap

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  role: z.enum(["ADMIN", "EDITOR"]),
  schoolId: z.string().cuid().optional().nullable(),
});

export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf"];
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20MB

export const documentTitleSchema = z.string().trim().min(1).max(120);

export const recordInputSchema = z.object({
  sport: z.string().trim().min(1).max(60),
  eventName: z.string().trim().min(1).max(120),
  mark: z.string().trim().min(1).max(40),
  athleteName: z.string().trim().min(1).max(120),
  schoolId: z.string().cuid().optional().nullable(),
  year: z.coerce.number().int().min(1900).max(2100),
});

export const hallOfFameInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  schoolId: z.string().cuid().optional().nullable(),
  classYear: z.coerce.number().int().min(1900).max(2100),
  note: z.string().trim().min(1).max(400),
});
