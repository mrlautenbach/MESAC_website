-- Admin-entered team count, replacing the schools page's computed count.
ALTER TABLE "School" ADD COLUMN "teamCount" INTEGER NOT NULL DEFAULT 0;
