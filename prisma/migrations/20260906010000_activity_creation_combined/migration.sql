-- Activity.defaultHostSchoolId is removed: creating an activity now always
-- creates its first tournament (with its own real host) in the same step,
-- so a separate "suggested default host" pre-fill has nothing left to be
-- useful for.

ALTER TABLE "Activity" DROP CONSTRAINT "Activity_defaultHostSchoolId_fkey";
DROP INDEX "Activity_defaultHostSchoolId_idx";
ALTER TABLE "Activity" DROP COLUMN "defaultHostSchoolId";
