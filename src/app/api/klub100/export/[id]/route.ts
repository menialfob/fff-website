import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";
import { computeIsCurator } from "@/modules/klub100/shared";

/**
 * Owner/admin export: a ZIP with manifest.json, manifest.csv and all cheers
 * recordings — everything needed to assemble the mix offline.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.klub100Project.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      admins: { select: { userId: true } },
      defaultCheers: { include: { recordedBy: { select: { name: true } } } },
      songs: {
        include: {
          suggestedBy: { select: { name: true } },
          cheers: { include: { recordedBy: { select: { name: true } } } },
          votes: { select: { userId: true } },
        },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!computeIsCurator(project, session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tracklist = project.songs
    .filter((s) => s.status === "ACCEPTED")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const pool = project.songs.filter((s) => s.status === "SUGGESTED");

  const zip = new JSZip();
  const cheersDir = zip.folder("cheers")!;
  const poolCheersDir = cheersDir.folder("pool")!;

  type Song = (typeof project.songs)[number];

  const cheersFileName = (song: Song, prefix: string) => {
    if (!song.cheers) return null;
    const ext = path.extname(song.cheers.storedName) || ".audio";
    return `${prefix}${slug(`${song.artist}-${song.title}`)}${ext}`;
  };

  const songJson = (song: Song, cheersFile: string | null) => ({
    position: song.position,
    title: song.title,
    artist: song.artist,
    album: song.album,
    spotifyTrackId: song.spotifyTrackId,
    spotifyUrl: song.spotifyUrl,
    durationMs: song.durationMs,
    segment1: { startMs: song.seg1StartMs, endMs: song.seg1EndMs },
    segment2:
      song.seg2StartMs !== null && song.seg2EndMs !== null
        ? { startMs: song.seg2StartMs, endMs: song.seg2EndMs }
        : null,
    placement: song.placement,
    placementNote: song.placementNote,
    cheersFile,
    // Null where the member behind the row has been deleted: the song and its
    // recording are group content and stay, attributed to nobody.
    cheersBy: song.cheers?.recordedBy?.name ?? null,
    suggestedBy: song.suggestedBy?.name ?? null,
    votes: song.votes.length,
  });

  const tracklistEntries: ReturnType<typeof songJson>[] = [];
  for (const song of tracklist) {
    const name = cheersFileName(
      song,
      `${String(song.position).padStart(3, "0")}-`,
    );
    if (song.cheers && name) {
      cheersDir.file(name, await readUpload(song.cheers.storedName));
    }
    tracklistEntries.push(songJson(song, name && `cheers/${name}`));
  }

  const poolEntries: ReturnType<typeof songJson>[] = [];
  for (const song of pool) {
    const name = cheersFileName(song, "");
    if (song.cheers && name) {
      poolCheersDir.file(name, await readUpload(song.cheers.storedName));
    }
    poolEntries.push(songJson(song, name && `cheers/pool/${name}`));
  }

  // The project's own "no cheers recorded" clip, so an offline assembly uses
  // the same fallback the live playback would.
  let defaultCheersFile: string | null = null;
  if (project.defaultCheers) {
    const ext = path.extname(project.defaultCheers.storedName) || ".audio";
    defaultCheersFile = `cheers/default${ext}`;
    cheersDir.file(
      `default${ext}`,
      await readUpload(project.defaultCheers.storedName),
    );
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        project: {
          name: project.name,
          createdBy: project.createdBy?.name ?? null,
          exportedAt: new Date().toISOString(),
          fadeInMs: project.fadeInMs,
          fadeOutMs: project.fadeOutMs,
          defaultCheersFile,
          defaultCheersBy: project.defaultCheers?.recordedBy?.name ?? null,
        },
        tracklist: tracklistEntries,
        pool: poolEntries,
      },
      null,
      2,
    ),
  );
  zip.file("manifest.csv", toCsv(tracklistEntries));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `klub100-${slug(project.name)}.zip`,
      )}`,
    },
  });
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

function toCsv(
  entries: {
    position: number | null;
    title: string;
    artist: string;
    album: string;
    spotifyUrl: string;
    durationMs: number;
    segment1: { startMs: number; endMs: number };
    segment2: { startMs: number; endMs: number } | null;
    placement: string | null;
    placementNote: string | null;
    cheersFile: string | null;
    suggestedBy: string | null;
    votes: number;
  }[],
): string {
  const header = [
    "position",
    "title",
    "artist",
    "album",
    "spotify_url",
    "duration_ms",
    "seg1_start_ms",
    "seg1_end_ms",
    "seg2_start_ms",
    "seg2_end_ms",
    "placement",
    "placement_note",
    "cheers_file",
    "suggested_by",
    "votes",
  ];
  const escape = (value: string | number | null) => {
    const s = value === null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map((e) =>
    [
      e.position,
      e.title,
      e.artist,
      e.album,
      e.spotifyUrl,
      e.durationMs,
      e.segment1.startMs,
      e.segment1.endMs,
      e.segment2?.startMs ?? null,
      e.segment2?.endMs ?? null,
      e.placement,
      e.placementNote,
      e.cheersFile,
      e.suggestedBy,
      e.votes,
    ]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}
