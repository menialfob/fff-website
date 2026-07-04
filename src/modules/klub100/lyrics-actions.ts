"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  fetchSyncedLyrics,
  lyricsCacheGet,
  lyricsCacheSet,
} from "@/lib/lrclib";
import { detectChoruses, parseLrc, type LyricsPayload } from "./lyrics";

const inputSchema = z.object({
  spotifyTrackId: z.string().min(1).max(64),
  artist: z.string().min(1).max(300),
  title: z.string().min(1).max(300),
  album: z.string().max(300),
  durationMs: z.number().int().positive(),
});

/**
 * Synced lyrics + chorus suggestions for a track, or null when none exist.
 * Deliberately never returns an error — lyrics are an assist, and the
 * segment picker must behave exactly as before when they're unavailable.
 */
export async function getLyrics(
  input: z.infer<typeof inputSchema>,
): Promise<{ lyrics: LyricsPayload | null }> {
  await requireSession();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { lyrics: null };
  const { spotifyTrackId, artist, title, album, durationMs } = parsed.data;

  const cached = lyricsCacheGet<LyricsPayload | null>(spotifyTrackId);
  if (cached !== undefined) return { lyrics: cached };

  let lyrics: LyricsPayload | null = null;
  try {
    const result = await fetchSyncedLyrics({
      artist,
      track: title,
      album,
      durationMs,
    });
    if (result) {
      const { lines, gapTimesMs } = parseLrc(result.syncedLyrics);
      if (lines.length > 0) {
        lyrics = {
          lines,
          suggestions: detectChoruses(lines, gapTimesMs, durationMs),
        };
      }
    }
  } catch (e) {
    // Full cause lands in the server logs (`docker compose logs app`).
    console.error("Klub 100 lyrics fetch failed:", e);
    return { lyrics: null }; // transient — don't cache
  }

  lyricsCacheSet(spotifyTrackId, lyrics);
  return { lyrics };
}
