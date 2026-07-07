-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,
    "eventDate" TEXT,
    CONSTRAINT "ChannelMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChannelMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChannelMessage" ("authorId", "body", "channelId", "createdAt", "id") SELECT "authorId", "body", "channelId", "createdAt", "id" FROM "ChannelMessage";
DROP TABLE "ChannelMessage";
ALTER TABLE "new_ChannelMessage" RENAME TO "ChannelMessage";
CREATE INDEX "ChannelMessage_channelId_createdAt_idx" ON "ChannelMessage"("channelId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
