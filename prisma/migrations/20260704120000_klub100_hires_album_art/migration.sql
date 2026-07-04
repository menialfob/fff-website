-- Upgrade already-stored album art to high resolution.
--
-- Songs suggested before this change stored the 64px Spotify cover, which
-- looks pixelated on the full-screen play screen. Spotify's image CDN encodes
-- the cover size in a fixed path token, and the same album resolves to every
-- size by swapping that token, so we can upgrade in place with no API calls:
--   ab67616d00004851 -> 64px   (what was stored)
--   ab67616d0000b273 -> 640px  (what we want)
-- The WHERE guard makes this a no-op for any URL that isn't a 64px Spotify
-- cover, so non-matching rows are left untouched.
UPDATE "Klub100Song"
SET "albumArtUrl" = REPLACE("albumArtUrl", 'ab67616d00004851', 'ab67616d0000b273')
WHERE "albumArtUrl" LIKE '%ab67616d00004851%';
