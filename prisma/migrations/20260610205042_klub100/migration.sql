-- CreateTable
CREATE TABLE "Klub100Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "reordered" BOOLEAN NOT NULL DEFAULT false,
    "mixed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Klub100Song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "suggestedById" TEXT NOT NULL,
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
    CONSTRAINT "Klub100Song_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Klub100Cheers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Klub100Cheers_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Klub100Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100Cheers_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Klub100Vote" (
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("songId", "userId"),
    CONSTRAINT "Klub100Vote_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Klub100Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Klub100Song_projectId_spotifyTrackId_key" ON "Klub100Song"("projectId", "spotifyTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "Klub100Cheers_songId_key" ON "Klub100Cheers"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "Klub100Cheers_storedName_key" ON "Klub100Cheers"("storedName");
