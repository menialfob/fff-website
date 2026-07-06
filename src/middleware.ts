import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Everything except the auth API, the token-authenticated iCal feed, the
// app icons / manifest and static assets requires a session. The feed must
// stay exempt: calendar apps subscribe without cookies and the route
// validates its own token. The icon and manifest routes must stay public so
// the browser (and iOS "Add to Home Screen") can fetch them before login.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/calendar/feed|icon|apple-icon|app-icon|manifest.webmanifest|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
