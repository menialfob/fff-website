"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markFolderSeen } from "./actions";

/**
 * Records that the member has opened this folder, clearing its unread badge.
 * Renders nothing.
 *
 * The refresh afterwards is what makes the badge disappear on the way back:
 * Next keeps the listing they came from in the client router cache and hands
 * it straight back on a back navigation, badge and all. router.refresh()
 * drops that cache. It only runs when this folder actually had something
 * unread, so the ordinary case of walking through folders costs nothing.
 */
export function MarkFolderSeen({
  folderId,
  unread,
}: {
  folderId: string;
  /** The count as this page was rendered — the badge left behind us. */
  unread: number;
}) {
  const router = useRouter();
  // Keyed by folder id at the call site, so this instance only ever speaks for
  // one folder; the ref stops the refresh's own re-render from looping.
  const pending = useRef(unread > 0);

  useEffect(() => {
    markFolderSeen(folderId)
      .then(() => {
        if (!pending.current) return;
        pending.current = false;
        router.refresh();
      })
      .catch(() => {});
  }, [folderId, router]);

  return null;
}
