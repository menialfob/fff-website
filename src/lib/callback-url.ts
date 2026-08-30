const DEFAULT_PATH = "/";

/**
 * Reduce a `callbackUrl` to a path on this site.
 *
 * NextAuth's middleware stores the blocked request's full href, so the value
 * normally arrives absolute — but it rides in a query string anyone can craft,
 * which makes it attacker-controlled. Only the path survives: an absolute URL
 * loses its host, and a `javascript:`/`mailto:` URL parses to a pathname with
 * no leading slash and is rejected outright. The result can therefore only
 * point back into the site, never off it.
 *
 * Edge-safe (`URL` only) — the middleware runs it through `auth.config.ts`.
 */
export function safeCallbackPath(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return DEFAULT_PATH;

  let url: URL;
  try {
    // The base is a throwaway: only pathname, search and hash are kept.
    url = new URL(raw, "https://fff.invalid");
  } catch {
    return DEFAULT_PATH;
  }

  const path = `${url.pathname}${url.search}${url.hash}`;
  // A "//…" path turns back into another origin the moment it is resolved
  // against one again (`new URL("//evil.com", site)` is `https://evil.com`),
  // and a pathname without a leading slash means the input carried its own
  // scheme. Neither is a page here.
  if (!path.startsWith("/") || path.startsWith("//")) return DEFAULT_PATH;
  // Landing back on the form would loop a member who just left it.
  if (path === "/login" || path.startsWith("/login?")) return DEFAULT_PATH;
  return path;
}
