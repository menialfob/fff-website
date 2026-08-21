-- CreateTable
CREATE TABLE "FolderView" (
    "userId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "folderId"),
    CONSTRAINT "FolderView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FolderView_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed a cursor for every existing member/folder pair from the one the files
-- section already kept, so the new per-folder badges start out agreeing with
-- what the home screen had been calling new. Without this every member meets
-- a numbered badge on every folder in the archive on the first deploy.
-- Members who join later get no rows and fall back to their join date.
INSERT INTO "FolderView" ("userId", "folderId", "seenAt")
SELECT u."id", f."id", COALESCE(v."seenAt", u."createdAt")
FROM "User" u
CROSS JOIN "Folder" f
LEFT JOIN "SectionView" v ON v."userId" = u."id" AND v."section" = 'files';
