"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUpload, saveUpload } from "@/lib/storage";
import { computeIsCurator, TRACKLIST_SIZE } from "./shared";

const MAX_CHEERS_SIZE = 5 * 1024 * 1024; // 5 MB

function projectPath(projectId: string) {
  return `/klub100/${projectId}`;
}

/** Owner, a project admin, or a site admin — the roles allowed to curate. */
async function requireCurator(projectId: string) {
  const session = await requireSession();
  const project = await prisma.klub100Project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      createdById: true,
      admins: { select: { userId: true } },
    },
  });
  if (!project) return { error: "Project not found." as const };
  if (!computeIsCurator(project, session.user)) {
    return { error: "Only the project owner or an admin can do this." as const };
  }
  return { session, project };
}

/**
 * The song's suggestor, or anyone who can curate its project — the roles
 * allowed to edit a suggestion (timing, placement, cheers).
 */
async function requireSongEditor(songId: string) {
  const session = await requireSession();
  const song = await prisma.klub100Song.findUnique({
    where: { id: songId },
    include: {
      cheers: true,
      project: {
        select: { createdById: true, admins: { select: { userId: true } } },
      },
    },
  });
  if (!song) return { error: "Song not found." as const };
  if (
    song.suggestedById !== session.user.id &&
    !computeIsCurator(song.project, session.user)
  ) {
    return { error: "Only the suggestor or a project admin can do this." as const };
  }
  return { session, song };
}

export async function createProject(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the project a name." };
  if (name.length > 80) return { error: "Name is too long (max 80 characters)." };

  await prisma.klub100Project.create({
    data: { name, createdById: session.user.id },
  });
  revalidatePath("/klub100");
  return { ok: true };
}

export async function deleteProject(projectId: string) {
  const curator = await requireCurator(projectId);
  if ("error" in curator) return { error: curator.error };

  // Collect cheers files before the cascade removes their rows.
  const cheers = await prisma.klub100Cheers.findMany({
    where: { song: { projectId } },
    select: { storedName: true },
  });
  await prisma.klub100Project.delete({ where: { id: projectId } });
  await Promise.all(cheers.map((c) => deleteUpload(c.storedName)));
  revalidatePath("/klub100");
  return { ok: true };
}

const segmentRange = (durationMs: number) =>
  z
    .object({ startMs: z.number().int().min(0), endMs: z.number().int().min(0) })
    .refine((s) => s.endMs > s.startMs, "Segment must end after it starts.")
    .refine(
      (s) => s.endMs - s.startMs <= 3 * 60_000,
      "Segment is too long (max 3 minutes).",
    )
    // Allow a second of slack for rounding against the reported duration.
    .refine((s) => s.endMs <= durationMs + 1000, "Segment is outside the track.");

/** Validate seg1 + optional seg2 against a track length; error message or null. */
function validateSegments(
  durationMs: number,
  data: {
    seg1StartMs: number;
    seg1EndMs: number;
    seg2StartMs: number | null;
    seg2EndMs: number | null;
  },
): string | null {
  const seg1 = segmentRange(durationMs).safeParse({
    startMs: data.seg1StartMs,
    endMs: data.seg1EndMs,
  });
  if (!seg1.success) return seg1.error.errors[0].message;
  if ((data.seg2StartMs === null) !== (data.seg2EndMs === null)) {
    return "Second segment is incomplete.";
  }
  if (data.seg2StartMs !== null && data.seg2EndMs !== null) {
    const seg2 = segmentRange(durationMs).safeParse({
      startMs: data.seg2StartMs,
      endMs: data.seg2EndMs,
    });
    if (!seg2.success) return seg2.error.errors[0].message;
  }
  return null;
}

const suggestSchema = z.object({
  projectId: z.string().min(1),
  spotifyTrackId: z.string().min(1),
  spotifyUrl: z.string().url(),
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  album: z.string().max(300),
  durationMs: z.number().int().positive(),
  albumArtUrl: z.string().url().nullable(),
  seg1StartMs: z.number().int().min(0),
  seg1EndMs: z.number().int().min(0),
  seg2StartMs: z.number().int().min(0).nullable(),
  seg2EndMs: z.number().int().min(0).nullable(),
  placement: z.enum(["EARLY", "MIDDLE", "LATE"]).nullable(),
  placementNote: z.string().max(300).nullable(),
});

export type SuggestSongInput = z.infer<typeof suggestSchema>;

export async function suggestSong(input: SuggestSongInput) {
  const session = await requireSession();
  const parsed = suggestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid suggestion." };
  }
  const data = parsed.data;

  const segError = validateSegments(data.durationMs, data);
  if (segError) return { error: segError };

  const existing = await prisma.klub100Song.findUnique({
    where: {
      projectId_spotifyTrackId: {
        projectId: data.projectId,
        spotifyTrackId: data.spotifyTrackId,
      },
    },
    include: { suggestedBy: { select: { name: true } } },
  });
  if (existing) {
    return { error: `Already suggested by ${existing.suggestedBy.name}.` };
  }

  try {
    const song = await prisma.klub100Song.create({
      data: {
        projectId: data.projectId,
        suggestedById: session.user.id,
        spotifyTrackId: data.spotifyTrackId,
        spotifyUrl: data.spotifyUrl,
        title: data.title,
        artist: data.artist,
        album: data.album,
        durationMs: data.durationMs,
        albumArtUrl: data.albumArtUrl,
        seg1StartMs: data.seg1StartMs,
        seg1EndMs: data.seg1EndMs,
        seg2StartMs: data.seg2StartMs,
        seg2EndMs: data.seg2EndMs,
        placement: data.placement,
        placementNote: data.placementNote?.trim() || null,
        // Suggesting counts as your own upvote.
        votes: { create: { userId: session.user.id } },
      },
    });
    revalidatePath(projectPath(data.projectId));
    return { ok: true, songId: song.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Someone just suggested this track." };
    }
    throw e;
  }
}

const editSchema = z.object({
  songId: z.string().min(1),
  seg1StartMs: z.number().int().min(0),
  seg1EndMs: z.number().int().min(0),
  seg2StartMs: z.number().int().min(0).nullable(),
  seg2EndMs: z.number().int().min(0).nullable(),
  placement: z.enum(["EARLY", "MIDDLE", "LATE"]).nullable(),
  placementNote: z.string().max(300).nullable(),
});

export type EditSongInput = z.infer<typeof editSchema>;

/** Edit a suggestion's timing, placement and note. Suggestor or curator only. */
export async function editSong(input: EditSongInput) {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid edit." };
  }
  const data = parsed.data;

  const editor = await requireSongEditor(data.songId);
  if ("error" in editor) return { error: editor.error };

  const segError = validateSegments(editor.song.durationMs, data);
  if (segError) return { error: segError };

  await prisma.klub100Song.update({
    where: { id: data.songId },
    data: {
      seg1StartMs: data.seg1StartMs,
      seg1EndMs: data.seg1EndMs,
      seg2StartMs: data.seg2StartMs,
      seg2EndMs: data.seg2EndMs,
      placement: data.placement,
      placementNote: data.placementNote?.trim() || null,
    },
  });
  revalidatePath(projectPath(editor.song.projectId));
  return { ok: true };
}

export async function deleteSuggestion(songId: string) {
  const session = await requireSession();
  const song = await prisma.klub100Song.findUnique({
    where: { id: songId },
    include: {
      cheers: true,
      project: {
        select: { createdById: true, admins: { select: { userId: true } } },
      },
    },
  });
  if (!song) return { error: "Song not found." };

  const isCurator = computeIsCurator(song.project, session.user);
  if (song.suggestedById !== session.user.id && !isCurator) {
    return { error: "You can only remove your own suggestions." };
  }
  if (song.status === "ACCEPTED" && !isCurator) {
    return { error: "This song is on the tracklist — ask the project owner." };
  }

  await prisma.klub100Song.delete({ where: { id: songId } });
  if (song.cheers) await deleteUpload(song.cheers.storedName);
  if (song.status === "ACCEPTED") await compactPositions(song.projectId);
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

export async function toggleVote(songId: string) {
  const session = await requireSession();
  const song = await prisma.klub100Song.findUnique({
    where: { id: songId },
    select: { projectId: true },
  });
  if (!song) return { error: "Song not found." };

  const key = { songId_userId: { songId, userId: session.user.id } };
  const existing = await prisma.klub100Vote.findUnique({ where: key });
  if (existing) {
    await prisma.klub100Vote.delete({ where: key });
  } else {
    await prisma.klub100Vote.create({
      data: { songId, userId: session.user.id },
    });
  }
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

export async function acceptSong(songId: string) {
  const song = await prisma.klub100Song.findUnique({
    where: { id: songId },
    select: { projectId: true, status: true },
  });
  if (!song) return { error: "Song not found." };
  const curator = await requireCurator(song.projectId);
  if ("error" in curator) return { error: curator.error };
  if (song.status === "ACCEPTED") return { ok: true };

  const accepted = await prisma.klub100Song.count({
    where: { projectId: song.projectId, status: "ACCEPTED" },
  });
  if (accepted >= TRACKLIST_SIZE) {
    return { error: `The tracklist is full (${TRACKLIST_SIZE} songs).` };
  }

  await prisma.klub100Song.update({
    where: { id: songId },
    data: { status: "ACCEPTED", position: accepted + 1 },
  });
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

export async function rejectSong(songId: string) {
  return setPoolStatus(songId, "REJECTED");
}

export async function restoreSong(songId: string) {
  return setPoolStatus(songId, "SUGGESTED");
}

/** Curator: move a song back to the pool (SUGGESTED) or to REJECTED. */
async function setPoolStatus(songId: string, status: "SUGGESTED" | "REJECTED") {
  const song = await prisma.klub100Song.findUnique({
    where: { id: songId },
    select: { projectId: true, status: true },
  });
  if (!song) return { error: "Song not found." };
  const curator = await requireCurator(song.projectId);
  if ("error" in curator) return { error: curator.error };

  await prisma.klub100Song.update({
    where: { id: songId },
    data: { status, position: null },
  });
  if (song.status === "ACCEPTED") await compactPositions(song.projectId);
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

export async function moveSong(songId: string, toPosition: number) {
  const song = await prisma.klub100Song.findUnique({
    where: { id: songId },
    select: { projectId: true, status: true },
  });
  if (!song) return { error: "Song not found." };
  const curator = await requireCurator(song.projectId);
  if ("error" in curator) return { error: curator.error };
  if (song.status !== "ACCEPTED") return { error: "Song is not on the tracklist." };

  const accepted = await prisma.klub100Song.findMany({
    where: { projectId: song.projectId, status: "ACCEPTED" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const from = accepted.findIndex((s) => s.id === songId);
  const to = Math.min(Math.max(Math.trunc(toPosition), 1), accepted.length) - 1;
  if (from === to) return { ok: true };

  const reordered = [...accepted];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  await prisma.$transaction(
    reordered.map((s, i) =>
      prisma.klub100Song.update({
        where: { id: s.id },
        data: { position: i + 1 },
      }),
    ),
  );
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

/** Re-number accepted songs 1..n after a removal. */
async function compactPositions(projectId: string) {
  const accepted = await prisma.klub100Song.findMany({
    where: { projectId, status: "ACCEPTED" },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    accepted.map((s, i) =>
      prisma.klub100Song.update({
        where: { id: s.id },
        data: { position: i + 1 },
      }),
    ),
  );
}

/**
 * Attach (or replace) the cheers recording on a song. Suggestor or curator only
 * — changing the cheers counts as editing the suggestion.
 */
export async function attachCheers(formData: FormData) {
  const songId = String(formData.get("songId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Record or choose an audio clip first." };
  }
  if (file.size > MAX_CHEERS_SIZE) {
    return { error: "Clip is too large (max 5 MB)." };
  }
  if (file.type && !file.type.startsWith("audio/")) {
    return { error: "Only audio files can be a cheers." };
  }

  const editor = await requireSongEditor(songId);
  if ("error" in editor) return { error: editor.error };
  const { session, song } = editor;

  const storedName = await saveUpload(file);
  if (song.cheers) {
    await prisma.klub100Cheers.delete({ where: { id: song.cheers.id } });
    await deleteUpload(song.cheers.storedName);
  }
  await prisma.klub100Cheers.create({
    data: {
      songId,
      storedName,
      mimeType: file.type || "audio/webm",
      size: file.size,
      recordedById: session.user.id,
    },
  });
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

/** Remove a song's cheers recording. Suggestor or curator only. */
export async function removeCheers(songId: string) {
  const editor = await requireSongEditor(songId);
  if ("error" in editor) return { error: editor.error };
  const { song } = editor;

  if (!song.cheers) return { ok: true };
  await prisma.klub100Cheers.delete({ where: { id: song.cheers.id } });
  await deleteUpload(song.cheers.storedName);
  revalidatePath(projectPath(song.projectId));
  return { ok: true };
}

/** Curator: grant another site member curator rights on this project. */
export async function addProjectAdmin(projectId: string, userId: string) {
  const curator = await requireCurator(projectId);
  if ("error" in curator) return { error: curator.error };

  if (userId === curator.project.createdById) return { ok: true }; // already implicit

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { error: "User not found." };

  try {
    await prisma.klub100ProjectAdmin.create({ data: { projectId, userId } });
  } catch (e) {
    // Already an admin — treat as success.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      throw e;
    }
  }
  revalidatePath(projectPath(projectId));
  return { ok: true };
}

/** Curator: revoke a project admin's curator rights. */
export async function removeProjectAdmin(projectId: string, userId: string) {
  const curator = await requireCurator(projectId);
  if ("error" in curator) return { error: curator.error };

  await prisma.klub100ProjectAdmin.deleteMany({ where: { projectId, userId } });
  revalidatePath(projectPath(projectId));
  return { ok: true };
}
