-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" TEXT,
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "startMinutes" INTEGER,
    "endMinutes" INTEGER,
    "date" TEXT,
    "endDate" TEXT,
    "endDayOffset" INTEGER,
    "freq" TEXT,
    "weekday" INTEGER,
    "ordinal" INTEGER,
    "month" INTEGER,
    "dayOfMonth" INTEGER,
    "folderId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarEvent_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Convert the dropped durationMinutes column into an explicit same-day end.
INSERT INTO "new_CalendarEvent" ("allDay", "contentJson", "createdAt", "createdById", "date", "dayOfMonth", "folderId", "freq", "id", "kind", "location", "month", "ordinal", "startMinutes", "endMinutes", "title", "updatedAt", "weekday") SELECT "allDay", "contentJson", "createdAt", "createdById", "date", "dayOfMonth", "folderId", "freq", "id", "kind", "location", "month", "ordinal", "startMinutes", CASE WHEN "startMinutes" IS NOT NULL AND "durationMinutes" IS NOT NULL THEN "startMinutes" + "durationMinutes" ELSE NULL END, "title", "updatedAt", "weekday" FROM "CalendarEvent";
DROP TABLE "CalendarEvent";
ALTER TABLE "new_CalendarEvent" RENAME TO "CalendarEvent";
CREATE UNIQUE INDEX "CalendarEvent_folderId_key" ON "CalendarEvent"("folderId");
CREATE INDEX "CalendarEvent_kind_date_idx" ON "CalendarEvent"("kind", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

