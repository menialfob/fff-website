-- CreateTable
CREATE TABLE "CalendarOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "contentJson" TEXT,
    "folderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalendarOccurrence_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOccurrence_folderId_key" ON "CalendarOccurrence"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOccurrence_eventId_date_key" ON "CalendarOccurrence"("eventId", "date");

