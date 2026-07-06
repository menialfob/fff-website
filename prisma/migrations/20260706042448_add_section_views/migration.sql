-- CreateTable
CREATE TABLE "SectionView" (
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "section"),
    CONSTRAINT "SectionView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
