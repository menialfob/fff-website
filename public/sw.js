/*
 * FFF service worker.
 *
 * Deliberately minimal and hand-written (no next-pwa / Workbox) — its only job
 * is Web Push: show a notification when one arrives, put the unread count on
 * the installed app's icon, and open the right page in the installed PWA when
 * it's tapped. It intentionally does not cache/offline anything, so there is
 * no stale-asset risk after a deploy.
 *
 * Served from /sw.js (root scope) and kept public in the middleware matcher so
 * it loads before login.
 */

// Activate immediately on install/update instead of waiting for old clients.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

/*
 * Put a number on the installed app's icon (Badging API).
 *
 * Supported on iOS/iPadOS 16.4+ once the PWA is installed and notification
 * permission is granted, and on desktop Chrome/Edge. Android Chrome has no
 * Badging API — it derives its own icon dot from the notification we show
 * below — so the feature check simply skips there.
 */
function applyBadge(count) {
  if (typeof count !== "number" || !Number.isFinite(count)) return;
  if (!self.navigator || !self.navigator.setAppBadge) return;
  const done =
    count > 0
      ? self.navigator.setAppBadge(count)
      : self.navigator.clearAppBadge();
  // The badge is cosmetic — never let it reject the push handler.
  return Promise.resolve(done).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "FFF";
  const options = {
    body: data.body || "",
    icon: "/app-icon/192",
    badge: "/app-icon/192",
    tag: data.tag || undefined,
    // Coalesce repeats under the same tag but still alert for the new one.
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      applyBadge(data.badgeCount),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an already-open window and navigate it to the target.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && target) {
            try {
              await client.navigate(target);
            } catch {
              /* cross-origin or not allowed — ignore */
            }
          }
          return;
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
