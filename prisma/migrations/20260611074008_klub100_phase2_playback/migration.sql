-- CreateTable
CREATE TABLE "SpotifyAccount" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "spotifyUserId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" DATETIME,
    "product" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpotifyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Klub100PlaybackState" (
    "projectId" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "segmentNo" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100PlaybackState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Klub100Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
