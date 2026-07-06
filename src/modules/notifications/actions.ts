"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { sendPushToUsers } from "@/lib/push";

type ActionResult = { ok?: true; error?: string };

/**
 * Store (or refresh) a Web Push subscription for the current member. Called
 * from the browser after `pushManager.subscribe()`. Keyed on the globally
 * unique endpoint, so re-subscribing the same browser updates the row (and
 * reassigns it to the current user) instead of duplicating.
 */
export async function subscribeToPush(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();

  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { error: t.errors.invalidInput };
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: session.user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300),
    },
    update: {
      userId: session.user.id,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300),
      lastSeenAt: new Date(),
    },
  });

  return { ok: true };
}

/** Remove a push subscription (member turned notifications off on a device). */
export async function unsubscribeFromPush(
  endpoint: string,
): Promise<ActionResult> {
  await requireSession();
  if (endpoint) {
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint } })
      .catch(() => {});
  }
  return { ok: true };
}

/**
 * Send a test notification to the current member's own devices so they can
 * confirm notifications actually arrive (especially useful on iOS, where the
 * PWA must be installed for push to work at all).
 */
export async function sendTestNotification(): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  await sendPushToUsers([session.user.id], {
    title: t.profile.notifications.testTitle,
    body: t.profile.notifications.testBody,
    url: "/",
    tag: "test",
  });
  return { ok: true };
}
