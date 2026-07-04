import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Everything except the auth API, the token-authenticated iCal feed and
// static assets requires a session. The feed must stay exempt: calendar
// apps subscribe without cookies and the route validates its own token.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/calendar/feed|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
