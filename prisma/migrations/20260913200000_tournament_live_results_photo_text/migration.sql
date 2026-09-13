-- Live results as an uploaded photo or pasted text, alongside the existing
-- external link - a swim/track meet often posts results as a photo of a
-- printed sheet rather than a hosted website.

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "liveResultsText" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "liveResultsPhotoUrl" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "liveResultsPhotoBlobPathname" TEXT;
