import { prisma } from "@/lib/db";

/**
 * The dashboard sections that track unread activity. These strings are the
 * `SectionView.section` values and must stay in sync with the module ids they
 * mirror (`forum`, `calendar`, `files`).
 */
export const SECTIONS = ["forum", "calendar", "files"] as const;
export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

/** A single "new since you last visited" item shown in the recent-activity list. */
export type ActivityItem = {
  // Matches an i18n key under `dashboard.recentActivity`.
  kind: "newFile" | "newEvent" | "newThread" | "newReply";
  // Which section this belongs to (drives the icon).
  section: Section;
  name: string;
  href: string;
  at: Date;
};

export type ActivitySummary = {
  counts: Record<Section, number>;
  recent: ActivityItem[];
};

const RECENT_PER_SECTION = 5;
const RECENT_TOTAL = 5;

/**
 * Compute per-section unread counts and a merged recent-activity list for a
 * user. "Unread" = created after the user last opened that section (falling
 * back to the user's join date, so the whole history isn't dumped on first
 * login), excluding the user's own contributions.
 */
export async function getActivitySummary(
  userId: string,
): Promise<ActivitySummary> {
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
  const since = (s: Section) => seen.get(s) ?? fallback;

  const [forumCount, calendarCount, filesCount, forumPosts, events, files] =
    await Promise.all([
      prisma.forumPost.count({
        where: {
          createdAt: { gt: since("forum") },
          createdById: { not: userId },
        },
      }),
      prisma.calendarEvent.count({
        where: {
          createdAt: { gt: since("calendar") },
          createdById: { not: userId },
        },
      }),
      prisma.fileItem.count({
        where: {
          createdAt: { gt: since("files") },
          uploadedById: { not: userId },
        },
      }),
      prisma.forumPost.findMany({
        where: {
          createdAt: { gt: since("forum") },
          createdById: { not: userId },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_PER_SECTION,
        select: {
          createdAt: true,
          thread: { select: { id: true, title: true, createdAt: true } },
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          createdAt: { gt: since("calendar") },
          createdById: { not: userId },
        },
        orderBy: { createdAt: "desc" },
        take: RECENT_PER_SECTION,
        select: { id: true, title: true, createdAt: true },
      }),
      prisma.fileItem.findMany({
        where: {
          createdAt: { gt: since("files") },
          uploadedById: { not: userId },
        },
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
  recent.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    counts: { forum: forumCount, calendar: calendarCount, files: filesCount },
    recent: recent.slice(0, RECENT_TOTAL),
  };
}
