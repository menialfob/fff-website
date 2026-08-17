import { prisma } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push";
import type { Section } from "@/lib/activity";

/**
 * Tell the club about something new outside chat — a forum post, a calendar
 * event, an upload, a new member.
 *
 * These are exactly the events that raise a badge on the home screen, so the
 * recipients are exactly the members whose badge just went up: every active
 * member except the one who did it (your own contributions never count towards
 * your own badge — see src/lib/activity.ts). Chat keeps its own rules —
 * per-conversation membership, mutes and presence — in `pushRecipients`.
 *
 * The section is used as the notification tag, so repeat activity in the same
 * section replaces the previous notification instead of stacking up: five
 * uploads in a row leave one "Filer" notification, matching the single number
 * the badge shows.
 *
 * Never throws — a failed notification must not break the write that triggered
 * it, exactly like the pushes in the chat module.
 */
export async function notifyMembers(input: {
  actorId: string;
  section: Section;
  /** Notification heading — the module's own label, e.g. "Forum". */
  title: string;
  body: string;
  /** Path the notification opens, e.g. "/forum/t/abc123". */
  url: string;
}): Promise<void> {
  try {
    const recipients = await prisma.user.findMany({
      where: { isActive: true, id: { not: input.actorId } },
      select: { id: true },
    });
    if (recipients.length === 0) return;
    await sendPushToUsers(
      recipients.map((r) => r.id),
      {
        title: input.title,
        body: input.body,
        url: input.url,
        tag: input.section,
      },
    );
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}
