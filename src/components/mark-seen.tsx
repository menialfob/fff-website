"use client";

import { useEffect } from "react";
import { markSectionSeen } from "@/lib/activity-actions";
import type { Section } from "@/lib/activity";

/**
 * Marks a dashboard section as seen for the current user when the page mounts,
 * clearing its unread badge on the home page. Renders nothing.
 */
export function MarkSeen({ section }: { section: Section }) {
  useEffect(() => {
    void markSectionSeen(section);
  }, [section]);
  return null;
}
