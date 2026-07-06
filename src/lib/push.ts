import webpush from "web-push";
import { prisma } from "@/lib/db";

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
  title: string;
  body: string;
  /** Path to open when the notification is tapped, e.g. "/chat/general". */
  url?: string;
  /** Collapse key so repeat notifications about the same thing replace. */
  tag?: string;
};

/**
 * Send a notification to every push subscription of the given users. Dead
 * subscriptions (410 Gone / 404 Not Found) are pruned. Never throws — a failed
 * push must not break the action that triggered it.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!configured || userIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
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
