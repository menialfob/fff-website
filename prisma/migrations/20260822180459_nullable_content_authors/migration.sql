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
    "displayName" TEXT,
    "blurData" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "uploadedById" TEXT,
    "folderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FileItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FileItem" ("blurData", "createdAt", "displayName", "durationMs", "folderId", "height", "id", "kind", "mimeType", "name", "size", "storedName", "thumbName", "uploadedById", "width") SELECT "blurData", "createdAt", "displayName", "durationMs", "folderId", "height", "id", "kind", "mimeType", "name", "size", "storedName", "thumbName", "uploadedById", "width" FROM "FileItem";
DROP TABLE "FileItem";
ALTER TABLE "new_FileItem" RENAME TO "FileItem";
CREATE UNIQUE INDEX "FileItem_storedName_key" ON "FileItem"("storedName");
CREATE INDEX "FileItem_folderId_createdAt_idx" ON "FileItem"("folderId", "createdAt");
CREATE TABLE "new_Klub100Cheers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "recordedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Klub100Cheers_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Klub100Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100Cheers_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Klub100Cheers" ("createdAt", "id", "mimeType", "recordedById", "size", "songId", "storedName") SELECT "createdAt", "id", "mimeType", "recordedById", "size", "songId", "storedName" FROM "Klub100Cheers";
DROP TABLE "Klub100Cheers";
ALTER TABLE "new_Klub100Cheers" RENAME TO "Klub100Cheers";
CREATE UNIQUE INDEX "Klub100Cheers_songId_key" ON "Klub100Cheers"("songId");
CREATE UNIQUE INDEX "Klub100Cheers_storedName_key" ON "Klub100Cheers"("storedName");
CREATE TABLE "new_Klub100DefaultCheers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "recordedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100DefaultCheers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Klub100Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100DefaultCheers_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Klub100DefaultCheers" ("createdAt", "id", "mimeType", "projectId", "recordedById", "size", "storedName", "updatedAt") SELECT "createdAt", "id", "mimeType", "projectId", "recordedById", "size", "storedName", "updatedAt" FROM "Klub100DefaultCheers";
DROP TABLE "Klub100DefaultCheers";
ALTER TABLE "new_Klub100DefaultCheers" RENAME TO "Klub100DefaultCheers";
CREATE UNIQUE INDEX "Klub100DefaultCheers_projectId_key" ON "Klub100DefaultCheers"("projectId");
CREATE UNIQUE INDEX "Klub100DefaultCheers_storedName_key" ON "Klub100DefaultCheers"("storedName");
CREATE TABLE "new_Klub100Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "fadeInMs" INTEGER NOT NULL DEFAULT 1000,
    "fadeOutMs" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Klub100Project" ("createdAt", "createdById", "fadeInMs", "fadeOutMs", "id", "name", "updatedAt") SELECT "createdAt", "createdById", "fadeInMs", "fadeOutMs", "id", "name", "updatedAt" FROM "Klub100Project";
DROP TABLE "Klub100Project";
ALTER TABLE "new_Klub100Project" RENAME TO "Klub100Project";
CREATE TABLE "new_Klub100Song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "suggestedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "position" INTEGER,
    "spotifyTrackId" TEXT NOT NULL,
    "spotifyUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "albumArtUrl" TEXT,
    "seg1StartMs" INTEGER NOT NULL,
    "seg1EndMs" INTEGER NOT NULL,
    "seg2StartMs" INTEGER,
    "seg2EndMs" INTEGER,
    "placement" TEXT,
    "placementNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100Song_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Klub100Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100Song_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Klub100Song" ("album", "albumArtUrl", "artist", "createdAt", "durationMs", "id", "placement", "placementNote", "position", "projectId", "seg1EndMs", "seg1StartMs", "seg2EndMs", "seg2StartMs", "spotifyTrackId", "spotifyUrl", "status", "suggestedById", "title", "updatedAt") SELECT "album", "albumArtUrl", "artist", "createdAt", "durationMs", "id", "placement", "placementNote", "position", "projectId", "seg1EndMs", "seg1StartMs", "seg2EndMs", "seg2StartMs", "spotifyTrackId", "spotifyUrl", "status", "suggestedById", "title", "updatedAt" FROM "Klub100Song";
DROP TABLE "Klub100Song";
ALTER TABLE "new_Klub100Song" RENAME TO "Klub100Song";
CREATE UNIQUE INDEX "Klub100Song_projectId_spotifyTrackId_key" ON "Klub100Song"("projectId", "spotifyTrackId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
