"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Getting bytes onto a member's device without ever navigating away from the
 * app.
 *
 * The site is installed to the home screen (`display: "standalone"` in
 * manifest.ts), which means the window has no browser chrome. A plain
 * `<a href="/api/files/…">` is a real top-level navigation: iOS loads the file
 * into that one window, shows its own document preview, and — because a
 * document load leaves no in-app history entry — there is no back button, no
 * back-swipe and no way out short of force-quitting. Safari is not an escape
 * either: an installed PWA gets storage separate from Safari, so a member sent
 * there lands on the login page rather than their file.
 *
 * So: nothing in this app may point the top-level window at a file URL.
 * Everything goes through here.
 */

/** Above this, the fetch-into-memory step is a bad bet on a phone. */
export const MAX_SAVE_BYTES = 150 * 1024 * 1024;

export class SaveTooLargeError extends Error {
  constructor() {
    super("save-too-large");
    this.name = "SaveTooLargeError";
  }
}

/** True once mounted inside an installed app rather than a browser tab. */
export function useIsStandalone(): boolean {
  // Starts false so the server render and the first client render agree.
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(isStandalone()), []);
  return standalone;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS predates the display-mode media query and still sets this.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/** Clicks a detached link. The only navigation-free way to start a download. */
function clickDownload(href: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Hands a blob to the member: the native share sheet where the platform offers
 * one (Save Image → Photos, Save to Files, AirDrop), an object-URL download
 * otherwise.
 */
export async function saveBlob(
  blob: Blob,
  name: string,
  mimeType?: string,
): Promise<void> {
  const file = new File([blob], name, {
    type: mimeType || blob.type || "application/octet-stream",
  });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // Dismissing the sheet rejects with AbortError. That is a decision, not
      // a failure — don't fall through to a download the member declined.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Anything else (no handler, permission) falls through to the download.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    clickDownload(url, name);
  } finally {
    // Give the click a turn of the event loop before dropping the URL.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Saves whatever the URL serves.
 *
 * In a browser tab this stays a plain anchor download: the browser streams
 * straight to disk, nothing is buffered in memory, and the tab's own chrome is
 * there if anything goes sideways. Only the installed app — where a navigation
 * would strand the member — pays the cost of pulling the bytes down first.
 */
export async function saveUrl(
  url: string,
  name: string,
  options: { mimeType?: string; size?: number } = {},
): Promise<void> {
  if (!isStandalone()) {
    clickDownload(url, name);
    return;
  }
  if (options.size != null && options.size > MAX_SAVE_BYTES) {
    throw new SaveTooLargeError();
  }

  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  if (blob.size > MAX_SAVE_BYTES) throw new SaveTooLargeError();
  await saveBlob(blob, name, options.mimeType);
}

type SaveState = {
  save: (run: () => Promise<void>) => void;
  saving: boolean;
  error?: string;
  clearError: () => void;
};

/**
 * Pending state and error handling around a save. `tooLarge` and `failed` are
 * the caller's already-localized strings — this module holds no copy.
 */
export function useSave(messages: {
  tooLarge: string;
  failed: string;
}): SaveState {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const { tooLarge, failed } = messages;

  const save = useCallback(
    (run: () => Promise<void>) => {
      setError(undefined);
      setSaving(true);
      run()
        .catch((err) => {
          setError(err instanceof SaveTooLargeError ? tooLarge : failed);
        })
        .finally(() => setSaving(false));
    },
    [tooLarge, failed],
  );

  return { save, saving, error, clearError: () => setError(undefined) };
}
