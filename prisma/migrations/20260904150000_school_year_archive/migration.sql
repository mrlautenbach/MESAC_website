-- One row per school year, 2010-11 through 2025-26 (startYear is the
-- first calendar year of the school year). Admins fill in resultsUrl
-- from the dashboard; rows themselves aren't created/deleted through the app.
CREATE TABLE "SchoolYearArchive" (
    "id" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "resultsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolYearArchive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolYearArchive_startYear_key" ON "SchoolYearArchive"("startYear");

INSERT INTO "SchoolYearArchive" ("id", "startYear", "updatedAt") VALUES
  ('syear-2010', 2010, CURRENT_TIMESTAMP),
  ('syear-2011', 2011, CURRENT_TIMESTAMP),
  ('syear-2012', 2012, CURRENT_TIMESTAMP),
  ('syear-2013', 2013, CURRENT_TIMESTAMP),
  ('syear-2014', 2014, CURRENT_TIMESTAMP),
  ('syear-2015', 2015, CURRENT_TIMESTAMP),
  ('syear-2016', 2016, CURRENT_TIMESTAMP),
  ('syear-2017', 2017, CURRENT_TIMESTAMP),
  ('syear-2018', 2018, CURRENT_TIMESTAMP),
  ('syear-2019', 2019, CURRENT_TIMESTAMP),
  ('syear-2020', 2020, CURRENT_TIMESTAMP),
  ('syear-2021', 2021, CURRENT_TIMESTAMP),
  ('syear-2022', 2022, CURRENT_TIMESTAMP),
  ('syear-2023', 2023, CURRENT_TIMESTAMP),
  ('syear-2024', 2024, CURRENT_TIMESTAMP),
  ('syear-2025', 2025, CURRENT_TIMESTAMP);
