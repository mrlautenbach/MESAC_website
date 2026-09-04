-- Suggested host pre-filled on an activity's first-tournament creation
-- form. Not a recurring host - Tournament.hostSchoolId still owns that.
ALTER TABLE "Activity" ADD COLUMN "defaultHostSchoolId" TEXT;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_defaultHostSchoolId_fkey" FOREIGN KEY ("defaultHostSchoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Activity_defaultHostSchoolId_idx" ON "Activity"("defaultHostSchoolId");
