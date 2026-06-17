"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeIsCurator } from "./shared";

/**
 * Crash-safe resume for live playback (phase-2 PRD §5): the engine persists
 * progress after every segment/cheers transition so the host can reopen the
 * play screen (even on another device) and pick up where the mix died.
 *
 * No revalidatePath here — these fire every ~minute during playback and the
 * play screen owns its own state; the saved row is only read on page load.
 */

/** Hosting is curation-level: project owner, project admin, or site admin. */
async function requireHost(projectId: string) {
  const session = await requireSession();
  const project = await prisma.klub100Project.findUnique({
    where: { id: projectId },
    select: { createdById: true, admins: { select: { userId: true } } },
  });
  if (!project) return { error: "Project not found." as const };
  if (!computeIsCurator(project, session.user)) {
    return { error: "Only the project owner or an admin can host playback." as const };
  }
  return { session };
}

export async function savePlaybackProgress(
  projectId: string,
  songId: string,
  segmentNo: number,
) {
  const host = await requireHost(projectId);
  if ("error" in host) return { error: host.error };
  if (segmentNo !== 1 && segmentNo !== 2) return { error: "Invalid segment." };

  await prisma.klub100PlaybackState.upsert({
    where: { projectId },
    create: { projectId, songId, segmentNo },
    update: { songId, segmentNo },
  });
  return { ok: true };
}

/** Called on "start over" and when the mix finishes. */
export async function clearPlaybackProgress(projectId: string) {
  const host = await requireHost(projectId);
  if ("error" in host) return { error: host.error };

  await prisma.klub100PlaybackState.deleteMany({ where: { projectId } });
  return { ok: true };
}
