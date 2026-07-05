import { prisma } from "@/lib/db";

// The stable slug of the seeded "Begivenheder" section that mirrors calendar
// events. It sorts before ordinary categories (negative order).
export const EVENTS_CATEGORY_SLUG = "begivenheder";

/**
 * Idempotently ensure the seeded Begivenheder category exists and return it.
 * Called from the calendar actions (before linking a thread) and from the
 * forum index page, so the section is always present even on a fresh install.
 */
export async function ensureEventsCategory() {
  return prisma.forumCategory.upsert({
    where: { slug: EVENTS_CATEGORY_SLUG },
    update: {},
    create: {
      slug: EVENTS_CATEGORY_SLUG,
      // Placeholder name; the UI renders an i18n label for isEvents sections.
      name: "Begivenheder",
      isEvents: true,
      order: -1,
    },
  });
}

/**
 * Create the discussion thread linked to a newly-created calendar event, in
 * the Begivenheder section. The thread has no folder yet — one is created
 * lazily the first time a reply carries an image or attachment.
 */
export async function createEventThread({
  eventId,
  title,
  createdById,
}: {
  eventId: string;
  title: string;
  createdById: string;
}) {
  const category = await ensureEventsCategory();
  await prisma.forumThread.create({
    data: { categoryId: category.id, title, eventId, createdById },
  });
}

/** Keep a linked event thread's title in sync with its event (no-op if none). */
export async function renameEventThread(eventId: string, title: string) {
  await prisma.forumThread.updateMany({ where: { eventId }, data: { title } });
}
