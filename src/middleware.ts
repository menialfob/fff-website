// Everything except the auth API, the token-authenticated iCal feed, the
// app icons / manifest / service worker and static assets requires a session.
// The feed must stay exempt: calendar apps subscribe without cookies and the
// route validates its own token. The icon, manifest and service worker routes
// must stay public so the browser (and iOS "Add to Home Screen") can fetch
// them before login — the service worker only handles push notifications and
// carries no private data.
//
// Runs on Node rather than the edge so it can use the full auth setup: its
// `jwt` callback re-reads the user row (Prisma) and the middleware is where the
// refreshed — or cleared — session cookie gets written back to the browser.
export { auth as default } from "@/lib/auth";

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!api/auth|api/calendar/feed|icon|apple-icon|app-icon|manifest.webmanifest|sw.js|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
