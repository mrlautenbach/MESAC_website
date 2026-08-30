-- AlterTable
ALTER TABLE "School" ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lon" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "mark" TEXT NOT NULL,
    "athleteName" TEXT NOT NULL,
    "schoolId" TEXT,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallOfFameEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolId" TEXT,
    "classYear" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "photoUrl" TEXT,
    "blobPathname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HallOfFameEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Record_sport_idx" ON "Record"("sport");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallOfFameEntry" ADD CONSTRAINT "HallOfFameEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
