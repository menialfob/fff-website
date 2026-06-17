-- CreateTable
CREATE TABLE "Klub100ProjectAdmin" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("projectId", "userId"),
    CONSTRAINT "Klub100ProjectAdmin_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Klub100Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Klub100ProjectAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
