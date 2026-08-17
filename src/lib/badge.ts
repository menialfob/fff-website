import { prisma } from "@/lib/db";
import { getSectionCounts } from "@/lib/activity";
import { chatUnreadCount } from "@/modules/chat/data";

/**
 * How many things are waiting for a member — the number shown on the installed
 * app's icon (see the Badging API usage in public/sw.js and
 * src/modules/notifications/app-badge.tsx).
 *
 * Deliberately the same "new for you" set the UI already flags: unread chat
 * messages plus the unread forum/calendar/files counts behind the dashboard
 * card badges. So the icon badge always matches what you see once you open
 * the app, and clearing them in-app clears the icon too.
 */
export async function getBadgeCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { extraRoles: { select: { role: true } } },
  });
  if (!user) return 0;

  const [chat, sections] = await Promise.all([
    chatUnreadCount({ extraRoles: user.extraRoles.map((r) => r.role) }, userId),
    getSectionCounts(userId),
  ]);

  return chat + sections.forum + sections.calendar + sections.files;
}
