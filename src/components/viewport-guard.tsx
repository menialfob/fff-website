"use client";

import { useEffect } from "react";
import { useIsStandalone } from "@/lib/download";
import { blurFocusedField, focusedField } from "@/lib/scroll-lock";

/**
 * Last line of defence for the drifting bottom tab bar.
 *
 * iOS can leave the web view displaced from the window — the keyboard opening
 * over a page that cannot scroll is the way in we know about (see
 * src/lib/scroll-lock.ts), but a rotation or an unsettled overscroll can do it
 * too. The page then behaves normally inside a viewport that is no longer where
 * the screen is: content scrolls as usual, and everything anchored to the
 * viewport — the tab bar, the header, the add button — sits a fixed distance off
 * the screen edges and stays there no matter how far anyone scrolls. Nothing in
 * the page undoes it, which is why the app had to be force-quit.
 *
 * The displacement is readable as `visualViewport.offsetTop`, so it can at least
 * be recognised. Recovery is a WebKit-behaviour guess rather than an API, so it
 * goes in two stages, gentlest first: fold the offset into a real scroll, which
 * costs nothing and keeps the reading position; and only if the offset is still
 * there afterwards, blur whatever holds it and run the page to the top, where
 * hitting the scroll clamp forces WebKit to re-anchor. The second stage moves
 * someone away from where they were reading, which is worth it only once the
 * first has demonstrably failed — that is a state the page is stuck in anyway.
 */

/** Below this the offset is rounding, not displacement. */
const DRIFT_PX = 2;
/** Long enough for a gesture, a rotation or the keyboard to settle first. */
const SETTLE_MS = 250;
/** Time for the gentle correction to take effect before escalating. */
const RECHECK_MS = 300;

export function ViewportGuard() {
  const standalone = useIsStandalone();

  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!standalone || !vv) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let recheck: ReturnType<typeof setTimeout> | undefined;

    /** Displaced, as opposed to legitimately offset. A pinch-zoom offsets the
     *  viewport by design, and while a field is focused the offset is the
     *  keyboard doing its job. */
    const drift = () =>
      vv.scale <= 1.01 && !focusedField() && vv.offsetTop > DRIFT_PX
        ? vv.offsetTop
        : 0;

    const correct = () => {
      const offset = drift();
      if (!offset) return;
      window.scrollTo(0, window.scrollY + offset);
      clearTimeout(recheck);
      recheck = setTimeout(() => {
        if (!drift()) return;
        blurFocusedField();
        window.scrollTo(0, 0);
      }, RECHECK_MS);
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
      clearTimeout(recheck);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [standalone]);

  return null;
}
