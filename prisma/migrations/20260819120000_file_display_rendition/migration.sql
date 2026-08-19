-- Viewer-sized rendition of an image, generated at upload (or lazily by the
-- media route for files that predate the column). Null means "no copy smaller
-- than the original is worth serving" — the viewer falls back to the original.
ALTER TABLE "FileItem" ADD COLUMN "displayName" TEXT;
