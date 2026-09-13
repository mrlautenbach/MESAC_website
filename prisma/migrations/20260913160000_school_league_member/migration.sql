-- A guest school plays in a tournament without being presented as a league
-- member. Existing schools are all members, hence the default.

-- AlterTable
ALTER TABLE "School" ADD COLUMN "isLeagueMember" BOOLEAN NOT NULL DEFAULT true;
