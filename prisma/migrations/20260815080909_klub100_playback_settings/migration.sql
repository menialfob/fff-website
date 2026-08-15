-- CreateTable
CREATE TABLE "Klub100DefaultCheers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100DefaultCheers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Klub100Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100DefaultCheers_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Klub100Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fadeInMs" INTEGER NOT NULL DEFAULT 1000,
    "fadeOutMs" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Klub100Project" ("createdAt", "createdById", "id", "name", "updatedAt") SELECT "createdAt", "createdById", "id", "name", "updatedAt" FROM "Klub100Project";
DROP TABLE "Klub100Project";
ALTER TABLE "new_Klub100Project" RENAME TO "Klub100Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Klub100DefaultCheers_projectId_key" ON "Klub100DefaultCheers"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Klub100DefaultCheers_storedName_key" ON "Klub100DefaultCheers"("storedName");
