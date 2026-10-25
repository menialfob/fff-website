import type { NextAuthConfig } from "next-auth";
import type { ExtraRole } from "@/lib/roles";

/**
 * Database-free part of the auth config: pages, session lifetime and the
 * route/session callbacks. auth.ts adds the Credentials provider and the
 * database-backed `jwt` callback that keeps the token in step with the user row.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Sliding: the middleware re-issues the cookie on every request, so this is
    // how long a member may stay away before having to log in again. It no
    // longer bounds stale access — role and deactivation changes reach the
    // token within REVALIDATE_MS (auth.ts) whatever its age.
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as "ADMIN" | "MEMBER";
      session.user.extraRoles = (token.extraRoles as ExtraRole[]) ?? [];
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
