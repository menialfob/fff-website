import type { NextAuthConfig } from "next-auth";
import type { ExtraRole } from "@/lib/roles";

/**
 * Edge-safe auth config (no database imports) shared between the middleware
 * and the full NextAuth setup in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Role and deactivation changes only take effect when the JWT is
    // re-minted at login — a modest lifetime caps how long a stale token
    // (e.g. of a deactivated user) keeps working.
    maxAge: 7 * 24 * 60 * 60,
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
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.extraRoles = user.extraRoles;
      }
      return token;
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
