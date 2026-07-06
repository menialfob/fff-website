-- CreateTable
CREATE TABLE "EventField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "EventField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OccurrenceFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "occurrenceId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "text" TEXT,
    "personId" TEXT,
    "fileId" TEXT,
    CONSTRAINT "OccurrenceFieldValue_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CalendarOccurrence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccurrenceFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EventField" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OccurrenceFieldValue_personId_fkey" FOREIGN KEY ("personId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OccurrenceFieldValue_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventField_eventId_idx" ON "EventField"("eventId");

-- CreateIndex
CREATE INDEX "OccurrenceFieldValue_fieldId_idx" ON "OccurrenceFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "OccurrenceFieldValue_occurrenceId_fieldId_key" ON "OccurrenceFieldValue"("occurrenceId", "fieldId");
