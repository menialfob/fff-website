/**
 * Server-side Spotify Web API client using the Client Credentials flow.
 * Used for track search and metadata only — no user account involved, so it
 * works for every member regardless of whether they have Spotify.
 *
 * The client secret never leaves the server; components call the server
 * actions in src/modules/klub100/search-actions.ts.
 */

export type SpotifyTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  albumArtUrl: string | null;
  spotifyUrl: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Spotify refused the app credentials — points at SPOTIFY_CLIENT_ID/SECRET. */
export class SpotifyAuthError extends Error {}

function credential(name: "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET"): string {
  // docker compose `env_file` passes surrounding quotes through literally,
  // so strip them (and stray whitespace) rather than fail auth confusingly.
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

export function spotifyConfigured(): boolean {
  return Boolean(credential("SPOTIFY_CLIENT_ID") && credential("SPOTIFY_CLIENT_SECRET"));
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(
    `${credential("SPOTIFY_CLIENT_ID")}:${credential("SPOTIFY_CLIENT_SECRET")}`,
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new SpotifyAuthError(
        `Spotify token request rejected (${res.status}): ${body.slice(0, 200)}`,
      );
    }
    throw new Error(`Spotify token request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

type SpotifyApiTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
  external_urls: { spotify: string };
};

export async function searchTracks(
  query: string,
  limit = 12,
): Promise<SpotifyTrack[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
    // Dev-mode apps need a concrete market since the Nov 2024 API changes —
    // tokens from client credentials carry no country to resolve it from.
    market: process.env.SPOTIFY_MARKET?.trim() || "DK",
  });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify search failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { tracks: { items: SpotifyApiTrack[] } };

  return data.tracks.items.map((t) => ({
    id: t.id,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    durationMs: t.duration_ms,
    // Smallest image that is still ≥ 64px wide, for list thumbnails.
    albumArtUrl:
      [...t.album.images].sort((a, b) => a.width - b.width).find((i) => i.width >= 64)
        ?.url ??
      t.album.images[0]?.url ??
      null,
    spotifyUrl: t.external_urls.spotify,
  }));
}
