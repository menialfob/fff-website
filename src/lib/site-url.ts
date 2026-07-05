import { headers } from "next/headers";

/**
 * The site's public origin (scheme + host, no trailing slash).
 *
 * Prefers the configured canonical `AUTH_URL` — the same value the Spotify
 * redirect relies on — because a request that reaches the container through
 * Caddy can see the internal `0.0.0.0` bind address instead of the public
 * host. That wrong host would otherwise leak into absolute links such as the
 * iCal feed's per-event `URL:` lines (which opened `0.0.0.0/...` on phones).
 * Falls back to the forwarded proxy headers, then the request host.
 */
export async function siteOrigin(): Promise<string> {
  const configured = (process.env.AUTH_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** The site's public host (no scheme), e.g. for `webcal://` links. */
export function hostOf(origin: string): string {
  return origin.replace(/^https?:\/\//, "");
}
