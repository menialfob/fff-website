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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
 * Site-wide ADMINs pass every role check (same superuser precedent as
 * elsewhere in the app).
 */
export async function requireRole(role: ExtraRole) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session;
  if (!session.user.extraRoles.includes(role)) throw new Error("Not authorized");
  return session;
}
