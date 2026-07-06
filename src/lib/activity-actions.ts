"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isSection } from "@/lib/activity";

/**
 * Record that the current user has just opened a dashboard section, so the
 * home page stops flagging its existing content as unread. Called on mount
 * from the section pages via `<MarkSeen />`. Never throws — a failed write
 * must not break the page.
 */
export async function markSectionSeen(
  section: string,
): Promise<{ ok: boolean }> {
  if (!isSection(section)) return { ok: false };
  try {
    const session = await requireSession();
    const now = new Date();
    await prisma.sectionView.upsert({
      where: { userId_section: { userId: session.user.id, section } },
      create: { userId: session.user.id, section, seenAt: now },
      update: { seenAt: now },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
