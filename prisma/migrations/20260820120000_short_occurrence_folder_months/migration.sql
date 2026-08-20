-- Shorten the month in the per-occurrence attachment folder names of recurring
-- events from "Title Juni 2025" to "Title Jun 2025" (see occurrenceFolderName
-- in src/modules/calendar/recurrence.ts). Folder names are truncated to a
-- single line wherever they are listed, and a long month name ran into the
-- ellipsis and took the year with it: "Title Septem…".
--
-- The Danish abbreviations are the first three letters of the full month
-- names, so one CASE yields both the suffix being replaced and the one
-- replacing it. Only folders still carrying the generated "<month> <year>"
-- suffix of their own occurrence are touched, so a diverged name is left alone
-- and a re-run is a no-op.
WITH occ AS (
  SELECT
    "folderId" AS "id",
    substr("date", 1, 4) AS "year",
    CASE substr("date", 6, 2)
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
    END AS "month"
  FROM "CalendarOccurrence"
  WHERE "folderId" IS NOT NULL
)
UPDATE "Folder"
SET "name" = (
  SELECT
    -- Everything before the " <month> <year>" suffix, i.e. the event title.
    substr("Folder"."name", 1, length("Folder"."name") - length(occ."month") - 6)
      || ' ' || substr(occ."month", 1, 3)
      || ' ' || occ."year"
  FROM occ
  WHERE occ."id" = "Folder"."id"
)
WHERE "id" IN (
  SELECT occ."id"
  FROM occ
  JOIN "Folder" AS f ON f."id" = occ."id"
  -- Compared with substr rather than LIKE, which ignores ASCII case and would
  -- also rewrite a folder someone renamed to "Titel juni 2025" by hand.
  WHERE length(f."name") > length(occ."month") + 6
    AND substr(f."name", -(length(occ."month") + 6))
        = ' ' || occ."month" || ' ' || occ."year"
);
