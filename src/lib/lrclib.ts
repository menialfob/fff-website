/**
 * Server-side client for LRCLIB (https://lrclib.net) — a free, keyless
 * community API for time-synced lyrics. Used by the Klub 100 segment picker
 * to show lyrics along the timeline and suggest chorus segments.
 *
 * Lyrics are an assist, never a requirement: callers treat `null` (and any
 * thrown error) as "no lyrics" and the picker works exactly as before.
 */

export type LrclibResult = {
  syncedLyrics: string;
  /** LRCLIB's track duration in seconds. */
  duration: number;
};

type LrclibApiRecord = {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

/**
 * LRCLIB's own /api/get duration matching is ±2s; we accept a bit more via
 * /api/search, but beyond this the timestamps likely belong to a different
 * master and would place misleading markers on the timeline.
 */
const MAX_DURATION_DRIFT_S = 7;

// LRCLIB asks clients to identify themselves.
const USER_AGENT = "FFF Klubhus Klub100 (private community site)";

async function lrclibGet(path: string): Promise<Response> {
  return fetch(`https://lrclib.net/api/${path}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
}

function usable(record: LrclibApiRecord, durationMs: number): boolean {
  return (
    !record.instrumental &&
    Boolean(record.syncedLyrics?.trim()) &&
    Math.abs(record.duration - durationMs / 1000) <= MAX_DURATION_DRIFT_S
  );
}

/**
 * Fetch synced lyrics for a track, or null when nothing trustworthy exists.
 * Tries the exact signature lookup first, then a search picking the
 * closest-duration synced result.
 */
export async function fetchSyncedLyrics(params: {
  artist: string;
  track: string;
  album: string;
  durationMs: number;
}): Promise<LrclibResult | null> {
  const { artist, track, album, durationMs } = params;

  const exact = await lrclibGet(
    `get?${new URLSearchParams({
      artist_name: artist,
      track_name: track,
      album_name: album,
      duration: String(Math.round(durationMs / 1000)),
    })}`,
  );
  if (exact.ok) {
    const record = (await exact.json()) as LrclibApiRecord;
    if (usable(record, durationMs)) {
      return { syncedLyrics: record.syncedLyrics!, duration: record.duration };
    }
  } else if (exact.status !== 404) {
    const body = await exact.text().catch(() => "");
    throw new Error(`LRCLIB get failed (${exact.status}): ${body.slice(0, 200)}`);
  }

  const search = await lrclibGet(
    `search?${new URLSearchParams({ artist_name: artist, track_name: track })}`,
  );
  if (!search.ok) {
    const body = await search.text().catch(() => "");
    throw new Error(
      `LRCLIB search failed (${search.status}): ${body.slice(0, 200)}`,
    );
  }
  const records = (await search.json()) as LrclibApiRecord[];
  const best = records
    .filter((record) => usable(record, durationMs))
    .sort(
      (a, b) =>
        Math.abs(a.duration - durationMs / 1000) -
        Math.abs(b.duration - durationMs / 1000),
    )[0];
  return best
    ? { syncedLyrics: best.syncedLyrics!, duration: best.duration }
    : null;
}

// ---------------------------------------------------------------------------
// In-memory cache, keyed by Spotify track id (same precedent as the token
// cache in spotify.ts). Losing it on deploy costs one free re-fetch, so a
// DB table isn't worth a migration.
// ---------------------------------------------------------------------------

const HIT_TTL_MS = 24 * 60 * 60_000;
const MISS_TTL_MS = 60 * 60_000;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, { value: unknown; expiresAt: number }>();

export function lyricsCacheGet<T>(trackId: string): T | undefined {
  const entry = cache.get(trackId);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(trackId);
    return undefined;
  }
  return entry.value as T;
}

export function lyricsCacheSet(trackId: string, value: unknown): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Maps iterate in insertion order — evict the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(trackId, {
    value,
    expiresAt: Date.now() + (value === null ? MISS_TTL_MS : HIT_TTL_MS),
  });
}
