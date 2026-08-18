-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FileItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "thumbName" TEXT,
    "blurData" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FileItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FileItem" ("createdAt", "folderId", "id", "mimeType", "name", "size", "storedName", "uploadedById") SELECT "createdAt", "folderId", "id", "mimeType", "name", "size", "storedName", "uploadedById" FROM "FileItem";
DROP TABLE "FileItem";
ALTER TABLE "new_FileItem" RENAME TO "FileItem";
CREATE UNIQUE INDEX "FileItem_storedName_key" ON "FileItem"("storedName");
CREATE INDEX "FileItem_folderId_createdAt_idx" ON "FileItem"("folderId", "createdAt");
CREATE TABLE "new_Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'USER',
    "parentId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Folder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Folder" ("createdAt", "createdById", "id", "name") SELECT "createdAt", "createdById", "id", "name" FROM "Folder";
DROP TABLE "Folder";
ALTER TABLE "new_Folder" RENAME TO "Folder";
CREATE INDEX "Folder_kind_parentId_name_idx" ON "Folder"("kind", "parentId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: classify existing files from their MIME type. Mirrors kindFor()
-- in src/modules/files/kind.ts; anything unrecognised stays OTHER.
UPDATE "FileItem" SET "kind" = 'IMAGE' WHERE "mimeType" LIKE 'image/%';
UPDATE "FileItem" SET "kind" = 'VIDEO' WHERE "mimeType" LIKE 'video/%';
UPDATE "FileItem" SET "kind" = 'AUDIO' WHERE "mimeType" LIKE 'audio/%';
UPDATE "FileItem" SET "kind" = 'PDF' WHERE "mimeType" = 'application/pdf';
UPDATE "FileItem" SET "kind" = 'DOC'
 WHERE "kind" = 'OTHER'
   AND ("mimeType" LIKE 'text/%'
     OR "mimeType" LIKE 'application/vnd.openxmlformats-officedocument.%'
     OR "mimeType" LIKE 'application/vnd.oasis.opendocument.%'
     OR "mimeType" IN (
          'application/msword',
          'application/vnd.ms-excel',
          'application/vnd.ms-powerpoint',
          'application/rtf'
        ));

-- Backfill: folders that belong to a calendar event/occurrence or a forum
-- thread were created implicitly by those modules, so they are ATTACHMENT
-- folders and must stay out of the browsable files tree.
UPDATE "Folder" SET "kind" = 'ATTACHMENT' WHERE "id" IN (
  SELECT "folderId" FROM "CalendarEvent"      WHERE "folderId" IS NOT NULL
  UNION SELECT "folderId" FROM "CalendarOccurrence" WHERE "folderId" IS NOT NULL
  UNION SELECT "folderId" FROM "ForumThread"        WHERE "folderId" IS NOT NULL
);
