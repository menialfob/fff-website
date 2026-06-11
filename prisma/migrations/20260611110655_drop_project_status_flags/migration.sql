/*
  Warnings:

  - You are about to drop the column `mixed` on the `Klub100Project` table. All the data in the column will be lost.
  - You are about to drop the column `reordered` on the `Klub100Project` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Klub100Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Klub100Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Klub100Project" ("createdAt", "createdById", "id", "name", "updatedAt") SELECT "createdAt", "createdById", "id", "name", "updatedAt" FROM "Klub100Project";
DROP TABLE "Klub100Project";
ALTER TABLE "new_Klub100Project" RENAME TO "Klub100Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
