-- Rename the per-occurrence attachment folders of recurring events from
-- "Title 2025-06-07" to "Title Juni 2025", matching how members refer to the
-- instances themselves (see occurrenceFolderName in
-- src/modules/calendar/recurrence.ts). All three recurrence patterns yield at
-- most one occurrence per month, so month + year stays unique within a series.
--
-- Only folders still carrying the generated " YYYY-MM-DD" suffix of their own
-- occurrence are touched, which also makes the migration a no-op on re-run.
UPDATE "Folder"
SET "name" = (
  SELECT substr("Folder"."name", 1, length("Folder"."name") - 11)
    || ' '
    || CASE substr("CalendarOccurrence"."date", 6, 2)
         WHEN '01' THEN 'Januar'
         WHEN '02' THEN 'Februar'
         WHEN '03' THEN 'Marts'
         WHEN '04' THEN 'April'
         WHEN '05' THEN 'Maj'
         WHEN '06' THEN 'Juni'
         WHEN '07' THEN 'Juli'
         WHEN '08' THEN 'August'
         WHEN '09' THEN 'September'
         WHEN '10' THEN 'Oktober'
         WHEN '11' THEN 'November'
         WHEN '12' THEN 'December'
       END
    || ' '
    || substr("CalendarOccurrence"."date", 1, 4)
  FROM "CalendarOccurrence"
  WHERE "CalendarOccurrence"."folderId" = "Folder"."id"
)
WHERE "id" IN (
  SELECT "CalendarOccurrence"."folderId"
  FROM "CalendarOccurrence"
  JOIN "Folder" ON "Folder"."id" = "CalendarOccurrence"."folderId"
  WHERE "Folder"."name" LIKE '_% ' || "CalendarOccurrence"."date"
);
