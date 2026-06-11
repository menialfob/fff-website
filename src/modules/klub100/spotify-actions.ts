"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Removes the caller's own Spotify connection. (Freeing the dashboard
 * allowlist slot itself is a manual step in the Spotify developer dashboard
 * — see docs/DEPLOYMENT.md.)
 */
export async function disconnectSpotify() {
  const session = await requireSession();
  await prisma.spotifyAccount.deleteMany({ where: { userId: session.user.id } });
  revalidatePath("/klub100");
  return { ok: true };
}
