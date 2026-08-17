import { prisma } from "@/lib/db";
import { getSectionCounts } from "@/lib/activity";
import { chatUnreadCount, viewerFor } from "@/modules/chat/data";
import type { ModuleId } from "@/modules/registry";

/**
 * How many new things are waiting for a member in each module — the numbers on
 * the home screen cards (src/app/(app)/page.tsx).
 *
 * Only modules with a meaningful "new for you" notion appear. Chat counts
 * unread messages from its per-conversation read cursors; forum, calendar,
 * files and members count what others created since the member last opened
 * that section (see src/lib/activity.ts). Klub 100 is a shared workspace you
 * dip into rather than a feed, and admin is a tool — neither is badged.
 */
export type ModuleBadgeCounts = Partial<Record<ModuleId, number>>;

export async function getModuleBadgeCounts(
  userId: string,
): Promise<ModuleBadgeCounts> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return {};

  const [chat, sections] = await Promise.all([
    chatUnreadCount(await viewerFor(userId), userId),
    getSectionCounts(userId),
  ]);
  return { chat, ...sections };
}

/**
 * The single number shown on the installed app's icon (see the Badging API
 * usage in public/sw.js and src/modules/notifications/app-badge.tsx): the sum
 * of the home screen badges, so the icon always matches what the member sees
 * once they open the app, and catching up in-app clears the icon too.
 */
export async function getBadgeCount(userId: string): Promise<number> {
  const counts = await getModuleBadgeCounts(userId);
  return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
}
