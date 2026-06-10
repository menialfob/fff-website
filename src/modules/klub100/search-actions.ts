"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  searchTracks,
  spotifyConfigured,
  SpotifyAuthError,
  type SpotifyTrack,
} from "@/lib/spotify";

export type SearchResult = SpotifyTrack & {
  /** Name of the member who already suggested this track, if any. */
  alreadySuggestedBy: string | null;
};

export async function searchSongs(projectId: string, query: string) {
  await requireSession();
  const trimmed = query.trim();
  if (!trimmed) return { tracks: [] as SearchResult[] };
  if (!spotifyConfigured()) {
    return {
      error:
        "Spotify search is not configured — an admin needs to set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.",
    };
  }

  let tracks: SpotifyTrack[];
  try {
    tracks = await searchTracks(trimmed);
  } catch (e) {
    // Full cause lands in the server logs (`docker compose logs app`).
    console.error("Klub 100 Spotify search failed:", e);
    if (e instanceof SpotifyAuthError) {
      return {
        error:
          "Spotify rejected the app credentials — double-check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the server.",
      };
    }
    return { error: "Spotify search failed — try again in a moment." };
  }

  const existing = await prisma.klub100Song.findMany({
    where: { projectId, spotifyTrackId: { in: tracks.map((t) => t.id) } },
    select: {
      spotifyTrackId: true,
      suggestedBy: { select: { name: true } },
    },
  });
  const byTrackId = new Map(
    existing.map((s) => [s.spotifyTrackId, s.suggestedBy.name]),
  );

  return {
    tracks: tracks.map((t) => ({
      ...t,
      alreadySuggestedBy: byTrackId.get(t.id) ?? null,
    })),
  };
}
