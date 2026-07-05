-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ForumThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT,
    "occurrenceId" TEXT,
    "folderId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForumThread_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ForumCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForumThread_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ForumThread_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CalendarOccurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ForumThread_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ForumThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ForumThread" ("categoryId", "createdAt", "createdById", "eventId", "folderId", "id", "locked", "pinned", "title", "updatedAt") SELECT "categoryId", "createdAt", "createdById", "eventId", "folderId", "id", "locked", "pinned", "title", "updatedAt" FROM "ForumThread";
DROP TABLE "ForumThread";
ALTER TABLE "new_ForumThread" RENAME TO "ForumThread";
CREATE UNIQUE INDEX "ForumThread_eventId_key" ON "ForumThread"("eventId");
CREATE UNIQUE INDEX "ForumThread_occurrenceId_key" ON "ForumThread"("occurrenceId");
CREATE UNIQUE INDEX "ForumThread_folderId_key" ON "ForumThread"("folderId");
CREATE INDEX "ForumThread_categoryId_updatedAt_idx" ON "ForumThread"("categoryId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
