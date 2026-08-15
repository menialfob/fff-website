"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getPendingCount } from "@/modules/notifications/actions";

const REFRESH_EVENT = "fff:badge-refresh";

/**
 * Ask the mounted `<AppBadge />` to re-read the count. Call this after moving
 * a read cursor (marking a channel or section seen), once the write has
 * resolved, so the icon badge drops as soon as the member catches up.
 */
export function refreshAppBadge() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

/**
 * Keeps the number on the installed app's icon in sync with the member's
 * pending count (Badging API — see also the push handler in public/sw.js,
 * which sets it while the app is closed).
 *
 * Pushes only reach members who are *not* connected, so this covers the rest:
 * it re-syncs on navigation, when the app returns to the foreground, and
 * whenever something marks content as read. Renders nothing, and no-ops
 * entirely where the API is unsupported (notably Android Chrome, which
 * derives its own icon dot from the notifications instead).
 */
export function AppBadge() {
  const pathname = usePathname();

  const sync = useCallback(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) {
      return;
    }
    getPendingCount()
      .then((count) =>
        count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge(),
      )
      // The badge is cosmetic — a signed-out or offline client just skips it.
      .catch(() => {});
  }, []);

  useEffect(() => {
    sync();
  }, [sync, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(REFRESH_EVENT, sync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(REFRESH_EVENT, sync);
    };
  }, [sync]);

  return null;
}
