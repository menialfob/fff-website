import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Everything except the auth API and static assets requires a session.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
