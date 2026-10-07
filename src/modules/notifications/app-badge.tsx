"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { ModuleBadgeCounts } from "@/lib/badge";
import { getPendingCounts } from "@/modules/notifications/actions";

const REFRESH_EVENT = "fff:badge-refresh";

/**
 * Ask the mounted `<BadgeProvider />` to re-read the counts. Call this after
 * moving a read cursor (marking a channel or section seen), once the write has
 * resolved, so the nav and icon badges drop as soon as the member catches up.
 */
export function refreshAppBadge() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

const BadgeCountsContext = createContext<ModuleBadgeCounts>({});

/** Per-module unread counts, for the navigation badges. */
export function useBadgeCounts(): ModuleBadgeCounts {
  return useContext(BadgeCountsContext);
}

/**
 * Keeps the member's pending counts live for the navigation badges and the
 * number on the installed app's icon (Badging API — see also the push handler
 * in public/sw.js, which sets it while the app is closed).
 *
 * The (app) layout persists across client navigations, so the counts it
 * renders with would go stale: this re-syncs on navigation, when the app
 * returns to the foreground, and whenever something marks content as read.
 * The icon badge no-ops where the API is unsupported (notably Android Chrome,
 * which derives its own icon dot from the notifications instead).
 */
export function BadgeProvider({
  initial,
  children,
}: {
  initial: ModuleBadgeCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [counts, setCounts] = useState(initial);
  // Syncs can overlap (navigation + a mark-seen refresh); only the latest
  // request may write, so a slow stale answer can't resurrect a cleared badge.
  const latest = useRef(0);

  const sync = useCallback(() => {
    const request = ++latest.current;
    getPendingCounts()
      .then((next) => {
        if (request !== latest.current) return;
        setCounts(next);
        if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) {
          return;
        }
        const total = Object.values(next).reduce((s, n) => s + (n ?? 0), 0);
        return total > 0
          ? navigator.setAppBadge(total)
          : navigator.clearAppBadge();
      })
      // The badges are cosmetic — a signed-out or offline client just skips.
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

  return (
    <BadgeCountsContext.Provider value={counts}>
      {children}
    </BadgeCountsContext.Provider>
  );
}
