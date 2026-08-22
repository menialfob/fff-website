import { prisma } from "@/lib/db";

/**
 * The dashboard sections that track unread activity with a "last opened"
 * cursor. These strings are the `SectionView.section` values and must stay in
 * sync with the module ids they mirror (`forum`, `calendar`, `files`,
 * `members`).
 *
 * Chat is deliberately absent: it counts unread messages per conversation from
 * its own read cursors (see `chatUnreadCount`), so it needs no section view.
 * Klub 100 has no unread concept at all, and admin is a tool rather than a feed
 * — neither is badged.
 */
export const SECTIONS = ["forum", "calendar", "files", "members"] as const;
export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

/** A single "new since you last visited" item shown in the recent-activity list. */
export type ActivityItem = {
  // Matches an i18n key under `dashboard.recentActivity`.
  kind: "newFile" | "newEvent" | "newThread" | "newReply" | "newMember";
  // Which section this belongs to (drives the icon).
  section: Section;
  name: string;
  href: string;
  at: Date;
};

const RECENT_PER_SECTION = 5;
const RECENT_TOTAL = 5;

/**
 * Resolve each section's "unread since" cutoff for a user: when they last
 * opened it, falling back to their join date so the whole history isn't
 * dumped on first login.
 */
async function sectionCutoffs(userId: string): Promise<(s: Section) => Date> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      sectionViews: { select: { section: true, seenAt: true } },
    },
  });
  const fallback = user?.createdAt ?? new Date(0);
  const seen = new Map<string, Date>();
  for (const v of user?.sectionViews ?? []) seen.set(v.section, v.seenAt);
  return (s: Section) => seen.get(s) ?? fallback;
}

/**
 * The "new for you" filter behind both the counts and the recent list: created
 * after the section's cutoff, and never the member's own contribution. Shared
 * so a badge can never disagree with the items it stands for.
 */
function sectionFilters(userId: string, since: (s: Section) => Date) {
  return {
    forum: {
      createdAt: { gt: since("forum") },
      createdById: { not: userId },
    },
    calendar: {
      createdAt: { gt: since("calendar") },
      createdById: { not: userId },
    },
    // `{ not: userId }` alone would drop files whose uploader has since been
    // deleted: in SQL `NULL != 'x'` is NULL, not true, so an orphaned upload
    // would stop counting for everybody. The same shape is repeated in
    // src/modules/files/unread.ts — the badge and the list behind it must
    // filter identically or they disagree.
    files: {
      createdAt: { gt: since("files") },
      OR: [{ uploadedById: null }, { uploadedById: { not: userId } }],
    },
    // Deactivated accounts are not news; neither is your own arrival.
    members: {
      createdAt: { gt: since("members") },
      id: { not: userId },
      isActive: true,
    },
  };
}

async function countSections(
  where: ReturnType<typeof sectionFilters>,
): Promise<Record<Section, number>> {
  const [forum, calendar, files, members] = await Promise.all([
    prisma.forumPost.count({ where: where.forum }),
    prisma.calendarEvent.count({ where: where.calendar }),
    prisma.fileItem.count({ where: where.files }),
    prisma.user.count({ where: where.members }),
  ]);
  return { forum, calendar, files, members };
}

/**
 * Per-section unread counts — the numbers behind the home screen card badges
 * and (summed with chat) the app-icon badge. "Unread" = created after the user
 * last opened that section, falling back to their join date so the whole
 * history isn't dumped on first login, and never their own contributions.
 */
export async function getSectionCounts(
  userId: string,
): Promise<Record<Section, number>> {
  const since = await sectionCutoffs(userId);
  return countSections(sectionFilters(userId, since));
}

/**
 * The merged "new since last visit" list under the home screen cards — the
 * same items the badges count, newest first.
 */
export async function getRecentActivity(
  userId: string,
): Promise<ActivityItem[]> {
  const since = await sectionCutoffs(userId);
  const where = sectionFilters(userId, since);

  const [forumPosts, events, files, members] = await Promise.all([
    prisma.forumPost.findMany({
      where: where.forum,
      orderBy: { createdAt: "desc" },
      take: RECENT_PER_SECTION,
      select: {
        createdAt: true,
        thread: { select: { id: true, title: true, createdAt: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: where.calendar,
      orderBy: { createdAt: "desc" },
      take: RECENT_PER_SECTION,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.fileItem.findMany({
      where: where.files,
      orderBy: { createdAt: "desc" },
      take: RECENT_PER_SECTION,
      select: { name: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: where.members,
      orderBy: { createdAt: "desc" },
      take: RECENT_PER_SECTION,
      select: { name: true, createdAt: true },
    }),
  ]);

  const recent: ActivityItem[] = [];
  for (const p of forumPosts) {
    // The opening post is created together with its thread, so their
    // timestamps match — treat those as a new thread and the rest as replies.
    const isOpening =
      Math.abs(p.createdAt.getTime() - p.thread.createdAt.getTime()) < 2000;
    recent.push({
      kind: isOpening ? "newThread" : "newReply",
      section: "forum",
      name: p.thread.title,
      href: `/forum/t/${p.thread.id}`,
      at: p.createdAt,
    });
  }
  for (const e of events) {
    recent.push({
      kind: "newEvent",
      section: "calendar",
      name: e.title,
      href: `/calendar/${e.id}`,
      at: e.createdAt,
    });
  }
  for (const f of files) {
    recent.push({
      kind: "newFile",
      section: "files",
      name: f.name,
      href: "/files",
      at: f.createdAt,
    });
  }
  for (const m of members) {
    recent.push({
      kind: "newMember",
      section: "members",
      name: m.name,
      href: "/members",
      at: m.createdAt,
    });
  }
  recent.sort((a, b) => b.at.getTime() - a.at.getTime());

  return recent.slice(0, RECENT_TOTAL);
}
