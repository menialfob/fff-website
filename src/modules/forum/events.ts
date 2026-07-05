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
 * Create the discussion thread linked to a newly-created ad hoc event, in the
 * Begivenheder section. The thread has no folder yet — one is created lazily
 * the first time a reply carries an image or attachment.
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

/** Keep an ad hoc event thread's title in sync with its event (no-op if none). */
export async function renameEventThread(eventId: string, title: string) {
  await prisma.forumThread.updateMany({ where: { eventId }, data: { title } });
}

/**
 * Ensure a Begivenheder thread exists for one recurring-event instance,
 * created the first time that occurrence is edited. Idempotent — re-saving the
 * occurrence just keeps the thread's title in sync with the (possibly renamed)
 * series. The instance date is rendered from the linked occurrence, so the
 * title stays the series title.
 */
export async function ensureOccurrenceThread({
  occurrenceId,
  title,
  createdById,
}: {
  occurrenceId: string;
  title: string;
  createdById: string;
}) {
  const category = await ensureEventsCategory();
  await prisma.forumThread.upsert({
    where: { occurrenceId },
    update: { title },
    create: { categoryId: category.id, title, occurrenceId, createdById },
  });
}

/** Keep every instance thread of a recurring series in sync with its title. */
export async function renameOccurrenceThreadsForEvent(
  eventId: string,
  title: string,
) {
  const occurrences = await prisma.calendarOccurrence.findMany({
    where: { eventId },
    select: { id: true },
  });
  if (occurrences.length === 0) return;
  await prisma.forumThread.updateMany({
    where: { occurrenceId: { in: occurrences.map((o) => o.id) } },
    data: { title },
  });
}
