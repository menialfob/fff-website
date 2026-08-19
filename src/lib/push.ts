import webpush from "web-push";
import { prisma } from "@/lib/db";
import { getBadgeCount } from "@/lib/badge";
import type { PushCategory } from "@/lib/push-categories";
import { recipientsWanting } from "@/lib/push-prefs";

// Web Push (VAPID) sender. Keys come from env — the public key is also exposed
// to the client as NEXT_PUBLIC_VAPID_PUBLIC_KEY so the browser can subscribe.
// When the keys are unset (e.g. local dev without notifications) every send is
// a silent no-op so nothing crashes.
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
// Contact URI the push services can reach us at; a mailto: is the convention.
const subject = process.env.VAPID_SUBJECT || "mailto:admin@fffloge.dk";

const configured = Boolean(publicKey && privateKey);
if (configured) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

export function pushConfigured(): boolean {
  return configured;
}

/** The notification payload the service worker (public/sw.js) renders. */
export type PushPayload = {
  /**
   * Which profile toggle governs this notification. Recipients who switched
   * the category off are dropped before anything is sent — the filtering must
   * happen here rather than in the service worker, because a push that arrives
   * and shows no notification is not free: `userVisibleOnly` subscriptions owe
   * the browser a notification per message, so Chrome posts its own "this site
   * has been updated in the background" instead and Safari cancels the
   * subscription outright after a few. A silenced category must therefore
   * never leave the server.
   *
   * `"always"` is for notifications the member asked for directly — the test
   * push from their own profile — which no toggle should be able to swallow.
   */
  category: PushCategory | "always";
  title: string;
  body: string;
  /** Path to open when the notification is tapped, e.g. "/chat/general". */
  url?: string;
  /** Collapse key so repeat notifications about the same thing replace. */
  tag?: string;
  /**
   * Number for the installed app's icon badge. Filled in per recipient by
   * `sendPushToUsers` — callers don't set it, since every member has a
   * different unread count. (Not to be confused with a notification's
   * `badge` option, which is the small monochrome status-bar icon.)
   */
  badgeCount?: number;
};

/**
 * Send a notification to every push subscription of the given users, skipping
 * the ones who turned `payload.category` off in their profile. Dead
 * subscriptions (410 Gone / 404 Not Found) are pruned. Never throws — a failed
 * push must not break the action that triggered it.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!configured || userIds.length === 0) return;

  // Preferences are per account, so this narrows the recipients once, before
  // any of their devices are looked up.
  const wanted =
    payload.category === "always"
      ? userIds
      : await recipientsWanting(userIds, payload.category);
  if (wanted.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: wanted } },
  });
  if (subs.length === 0) return;

  // `category` decided who gets this above and is of no use to the device, so
  // what goes over the wire is spelled out here: exactly the keys public/sw.js
  // reads, plus the per-recipient badge count below. (Undefined url/tag drop
  // out of the JSON on their own.)
  const wire = {
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  };

  // The badge is per member, so the body differs per recipient — compute one
  // count per user that actually has a subscription (a user may have several).
  // A failed count must not block the notification, so it falls back to
  // undefined — JSON drops the key and the service worker leaves the badge
  // as it is rather than clearing it.
  const bodyByUser = new Map<string, string>();
  await Promise.all(
    [...new Set(subs.map((s) => s.userId))].map(async (id) => {
      const badgeCount = await getBadgeCount(id).catch(() => undefined);
      bodyByUser.set(id, JSON.stringify({ ...wire, badgeCount }));
    }),
  );

  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          bodyByUser.get(sub.userId) ?? JSON.stringify(wire),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id);
        } else {
          console.error("[push] send failed:", statusCode ?? err);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: stale } } })
      .catch(() => {});
  }
}
