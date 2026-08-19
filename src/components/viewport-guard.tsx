"use client";

import { useEffect } from "react";
import { useIsStandalone } from "@/lib/download";

/**
 * Last line of defence for the drifting bottom tab bar.
 *
 * WebKit can leave the layout viewport offset from the visible one — the
 * keyboard opening over a modal that cannot scroll, an overscroll it never
 * settles, a rotation mid-gesture. Everything laid out against the viewport
 * then paints that far up the screen: the tab bar floats above the bottom edge
 * with a black band under it, and the header disappears behind the status bar.
 * Nothing in the page corrects it on its own, which is why the app had to be
 * force-quit to get back to normal.
 *
 * The offset is readable as `visualViewport.offsetTop`, and folding it into a
 * real document scroll is what makes WebKit re-anchor the two: the content stays
 * exactly where it is on screen and the fixed chrome snaps back to the edges.
 *
 * src/lib/scroll-lock.ts removes the causes we know of; this catches the rest.
 * It only runs in the installed app, where the bug lives and where no browser
 * toolbar can make the measurement lie.
 */

/** Below this the offset is rounding, not drift. */
const DRIFT_PX = 2;
/** Long enough for a gesture, a rotation or the keyboard to settle first. */
const SETTLE_MS = 250;

export function ViewportGuard() {
  const standalone = useIsStandalone();

  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!standalone || !vv) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const correct = () => {
      // A pinch-zoom offsets the viewport by design, and while a field is
      // focused the offset is the keyboard doing its job. Neither is drift.
      if (vv.scale > 1.01) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      if (vv.offsetTop <= DRIFT_PX) return;
      window.scrollTo(0, window.scrollY + vv.offsetTop);
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(correct, SETTLE_MS);
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();

    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [standalone]);

  return null;
}
