"use client";

import { useEffect, useState } from "react";

/**
 * Locking the page behind a modal, and keeping the app's fixed chrome where it
 * belongs while it is locked.
 *
 * The obvious lock — `body { overflow: hidden }` — is what left the bottom tab
 * bar floating in the middle of the screen on iPhone. Body overflow propagates
 * to the viewport, so setting it while the page is scrolled collapses the
 * scrollable area out from under WebKit, and WebKit does not re-clamp: the
 * layout viewport keeps its old offset and every `position: fixed` element is
 * painted that far above the screen, with a black band where the tab bar
 * should be and the header hidden under the status bar. The on-screen keyboard
 * gets there the same way — iOS shifts the viewport to reveal a field it cannot
 * scroll to, and with nothing left to scroll back the shift outlives the sheet,
 * the keyboard and every later navigation. Nothing in the page resets it, which
 * is why the app had to be force-quit.
 *
 * Taking the body out of flow instead pins the document at offset 0 for as long
 * as the modal lives, so no scroll area can collapse underneath it, and the
 * explicit `scrollTo` on release does double duty: it restores the reading
 * position and hands WebKit a real scroll, which is what makes it re-clamp a
 * viewport it had shifted.
 */

/** How much shorter than the window the visual viewport must be to count as a
 *  keyboard rather than browser chrome. */
const KEYBOARD_PX = 120;

/** Counted, so the lock composes: one modal opening over another — or handing
 *  off to it, which the sheets do inside a single commit — must not hand the
 *  page back early. Only the outermost lock touches the body, and the offset it
 *  captured is the one restored. */
let locks = 0;
let scrollY = 0;
let saved: Record<string, string> = {};

/** Everything `lock` writes, and so everything it has to put back. */
const PROPERTIES = ["position", "top", "left", "right", "width", "overflow"];

function lock() {
  if (locks++ > 0) return;
  const { style } = document.body;
  scrollY = window.scrollY;
  saved = {};
  for (const property of PROPERTIES) {
    saved[property] = style.getPropertyValue(property);
  }
  Object.assign(style, {
    position: "fixed",
    // Holding the page at its reading position, since the document behind a
    // locked body is pinned to offset 0.
    top: `-${scrollY}px`,
    left: "0px",
    right: "0px",
    width: "100%",
    overflow: "hidden",
  });
}

function unlock() {
  if (locks === 0 || --locks > 0) return;
  const { style } = document.body;
  for (const [property, value] of Object.entries(saved)) {
    if (value) style.setProperty(property, value);
    else style.removeProperty(property);
  }
  window.scrollTo(0, scrollY);
  // If the keyboard shifted the viewport while the sheet was open, one scroll
  // is not always enough to bring it back — the offset only shows up once
  // WebKit has settled. Measure on the next frame and correct what is left.
  requestAnimationFrame(() => {
    const drift = window.visualViewport?.offsetTop ?? 0;
    if (drift > 1) window.scrollTo(0, window.scrollY + drift);
  });
}

/** Freeze the page behind a modal for as long as `active` holds. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}

/**
 * The height of the visible area while the on-screen keyboard is up, or `null`
 * when it is down.
 *
 * iOS never shrinks the layout viewport for the keyboard, so a bottom-anchored
 * sheet keeps sitting at the bottom of the screen — behind the keys. Its text
 * fields end up out of sight, iOS shifts the whole viewport to reveal them, and
 * that shift is the drift described above. Sizing the sheet to the visual
 * viewport puts the field above the keyboard in the first place, so there is
 * nothing for iOS to shift.
 */
export function useKeyboardViewport(active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const apply = () => {
      setHeight(window.innerHeight - vv.height > KEYBOARD_PX ? vv.height : null);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      setHeight(null);
    };
  }, [active]);

  return height;
}
