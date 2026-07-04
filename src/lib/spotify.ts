/**
 * Server-side Spotify Web API client.
 *
 * Two flows live here:
 *  - Client Credentials — track search and metadata, no user account
 *    involved, works for every member regardless of whether they have
 *    Spotify. Components call the server actions in
 *    src/modules/klub100/search-actions.ts.
 *  - Authorization Code + PKCE — per-user connections for hosting Klub 100
 *    live playback (Web Playback SDK needs a user token with the
 *    `streaming` scope). Tokens are stored in the SpotifyAccount table and
 *    only short-lived access tokens ever reach the browser, via
 *    /api/spotify/token.
 *
 * The client secret never leaves the server.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

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
  // Spotify's Feb 2026 dev-mode changes cap the search limit at 10
  // (requests above that fail with a 400 "Invalid limit").
  limit = 10,
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
    // Highest-resolution cover Spotify offers (usually 640px). It fills the
    // full-screen play screen, so we favour quality; list thumbnails
    // downscale it and lazy-load so long tracklists stay cheap.
    albumArtUrl:
      [...t.album.images].sort((a, b) => b.width - a.width)[0]?.url ?? null,
    spotifyUrl: t.external_urls.spotify,
  }));
}

// ---------------------------------------------------------------------------
// Per-user auth (Authorization Code + PKCE) for hosting live playback.
// ---------------------------------------------------------------------------

export const SPOTIFY_SCOPES = "streaming user-read-email user-read-private";

/**
 * The redirect URI registered in the Spotify dashboard. Defaults to
 * AUTH_URL + /api/spotify/callback; override with SPOTIFY_REDIRECT_URI for
 * local dev, where Spotify only accepts the literal loopback
 * http://127.0.0.1:<port>/… (never http://localhost — it's rejected).
 */
export function spotifyRedirectUri(): string {
  const override = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (override) return override;
  const base = (process.env.AUTH_URL ?? "").trim().replace(/\/$/, "");
  return `${base}/api/spotify/callback`;
}

export function generateCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function spotifyAuthorizeUrl(params: {
  state: string;
  verifier: string;
}): string {
  const search = new URLSearchParams({
    client_id: credential("SPOTIFY_CLIENT_ID"),
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    state: params.state,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge(params.verifier),
  });
  return `https://accounts.spotify.com/authorize?${search}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

async function requestUserToken(body: URLSearchParams): Promise<TokenResponse> {
  // PKCE token requests authenticate with the client_id in the body — no
  // client secret involved.
  body.set("client_id", credential("SPOTIFY_CLIENT_ID"));
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string, verifier: string) {
  return requestUserToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
      code_verifier: verifier,
    }),
  );
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<{ id: string; product: string | null }> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify profile request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; product?: string };
  return { id: data.id, product: data.product ?? null };
}

/**
 * Returns a valid access token for the user's connected Spotify account,
 * refreshing (and persisting) it when it's within a minute of expiry.
 * Access tokens last ~1 h and a mix runs ~2 h, so the play screen calls
 * /api/spotify/token (which calls this) whenever the SDK asks for a token.
 */
export async function getUserAccessToken(userId: string): Promise<
  | { accessToken: string; expiresAt: Date; product: string | null }
  | { error: "not-connected" | "refresh-failed" }
> {
  const account = await prisma.spotifyAccount.findUnique({ where: { userId } });
  if (!account) return { error: "not-connected" };

  if (
    account.accessToken &&
    account.expiresAt &&
    account.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return {
      accessToken: account.accessToken,
      expiresAt: account.expiresAt,
      product: account.product,
    };
  }

  let tokens: TokenResponse;
  try {
    tokens = await requestUserToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      }),
    );
  } catch (e) {
    console.error(`Spotify token refresh failed for user ${userId}:`, e);
    return { error: "refresh-failed" };
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.spotifyAccount.update({
    where: { userId },
    data: {
      accessToken: tokens.access_token,
      expiresAt,
      // Spotify may rotate the refresh token on use.
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    },
  });
  return { accessToken: tokens.access_token, expiresAt, product: account.product };
}
