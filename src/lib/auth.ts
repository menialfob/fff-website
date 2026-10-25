import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { ExtraRole } from "@/lib/roles";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// How often a session re-reads its user row. Sessions are long-lived, so this
// — not the session lifetime — is what bounds how long a deactivated member
// keeps access or a role change takes to arrive.
const REVALIDATE_MS = 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.extraRoles = user.extraRoles;
        token.checkedAt = Date.now();
        return token;
      }
      if (!token.id || Date.now() - (token.checkedAt ?? 0) < REVALIDATE_MS) {
        return token;
      }

      let current;
      try {
        current = await prisma.user.findUnique({
          where: { id: token.id },
          select: {
            name: true,
            email: true,
            role: true,
            isActive: true,
            extraRoles: { select: { role: true } },
          },
        });
      } catch (error) {
        // Auth.js deletes the cookie when this callback throws — a database
        // hiccup must not log everyone out, so keep the token and retry on the
        // next request.
        console.error("Session revalidation failed", error);
        return token;
      }
      // Returning null clears the session cookie.
      if (!current || !current.isActive) return null;

      token.name = current.name;
      token.email = current.email;
      token.role = current.role;
      token.extraRoles = current.extraRoles.map((r) => r.role);
      token.checkedAt = Date.now();
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: { extraRoles: true },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        // Deactivated accounts get the same generic error as bad credentials.
        if (!user.isActive) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await logEvent({ actorId: user.id, action: "auth.login" });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          extraRoles: user.extraRoles.map((r) => r.role),
        };
      },
    }),
  ],
});

/** Returns the session or throws — for server actions/routes that require login. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session;
}

/** Returns the session or throws if the user is not an admin. */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

/**
 * Returns the session or throws unless the user holds the given extra role.
 * Site-wide ADMINs pass every role check (same superuser precedent as module
 * access in src/modules/registry.ts). Role-gated chat channels are the one
 * exception — they are private conversation rather than administrable content,
 * so `canAccessConversation` requires the role itself.
 */
export async function requireRole(role: ExtraRole) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session;
  if (!session.user.extraRoles.includes(role)) throw new Error("Not authorized");
  return session;
}
