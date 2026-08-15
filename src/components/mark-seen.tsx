"use client";

import { useEffect } from "react";
import { markSectionSeen } from "@/lib/activity-actions";
import type { Section } from "@/lib/activity";
import { refreshAppBadge } from "@/modules/notifications/app-badge";

/**
 * Marks a dashboard section as seen for the current user when the page mounts,
 * clearing its unread badge on the home page — and the app-icon badge it
 * feeds into. Renders nothing.
 */
export function MarkSeen({ section }: { section: Section }) {
  useEffect(() => {
    markSectionSeen(section).then(refreshAppBadge).catch(() => {});
  }, [section]);
  return null;
}
