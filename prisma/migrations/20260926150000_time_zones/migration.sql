-- CreateEnum
CREATE TYPE "LeagueTimeZone" AS ENUM ('GULF', 'QATAR', 'INDIA');

-- AlterTable
ALTER TABLE "School" ADD COLUMN "timeZone" "LeagueTimeZone" NOT NULL DEFAULT 'GULF';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "timeZone" "LeagueTimeZone";

-- The member schools outside the UAE and Oman.
UPDATE "School" SET "timeZone" = 'QATAR' WHERE "slug" = 'american-school-of-doha' OR "code" = 'Doha';
UPDATE "School" SET "timeZone" = 'INDIA' WHERE "slug" = 'american-embassy-school-new-delhi-india' OR "code" = 'AES';
