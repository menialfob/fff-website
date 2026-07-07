/*
 * FFF service worker.
 *
 * Deliberately minimal and hand-written (no next-pwa / Workbox) — its only job
 * is Web Push: show a notification when one arrives and open the right page in
 * the installed PWA when it's tapped. It intentionally does not cache/offline
 * anything, so there is no stale-asset risk after a deploy.
 *
 * Served from /sw.js (root scope) and kept public in the middleware matcher so
 * it loads before login.
 */

// Activate immediately on install/update instead of waiting for old clients.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

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

  event.waitUntil(self.registration.showNotification(title, options));
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
