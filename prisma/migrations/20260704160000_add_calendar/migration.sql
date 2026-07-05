-- AlterTable
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" TEXT,
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "startMinutes" INTEGER,
    "durationMinutes" INTEGER,
    "date" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_folderId_key" ON "CalendarEvent"("folderId");

-- CreateIndex
CREATE INDEX "CalendarEvent_kind_date_idx" ON "CalendarEvent"("kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

