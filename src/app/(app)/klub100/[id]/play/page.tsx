import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spotifyConfigured } from "@/lib/spotify";
import { PlayScreen } from "@/modules/klub100/play-screen";
import { TRACKLIST_SIZE } from "@/modules/klub100/shared";
import type { PlaybackSong } from "@/modules/klub100/playback-engine";

export default async function Klub100PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const project = await prisma.klub100Project.findUnique({
    where: { id },
    include: {
      playbackState: true,
      songs: {
        where: { status: "ACCEPTED" },
        orderBy: { position: "asc" },
        include: {
          suggestedBy: { select: { name: true } },
          cheers: { select: { id: true } },
        },
      },
    },
  });
  if (!project) notFound();

  const isHost =
    project.createdById === session.user.id || session.user.role === "ADMIN";

  const songs: PlaybackSong[] = project.songs.map((s) => ({
    id: s.id,
    position: s.position ?? 0,
    spotifyTrackId: s.spotifyTrackId,
    title: s.title,
    artist: s.artist,
    albumArtUrl: s.albumArtUrl,
    suggestedByName: s.suggestedBy.name,
    hasCheers: Boolean(s.cheers),
    segments: [
      { startMs: s.seg1StartMs, endMs: s.seg1EndMs },
      ...(s.seg2StartMs !== null && s.seg2EndMs !== null
        ? [{ startMs: s.seg2StartMs, endMs: s.seg2EndMs }]
        : []),
    ],
  }));

  const account = await prisma.spotifyAccount.findUnique({
    where: { userId: session.user.id },
    select: { product: true },
  });

  // Only offer resume if the saved song is still on the tracklist.
  const resumeSongId =
    project.playbackState && songs.some((s) => s.id === project.playbackState!.songId)
      ? project.playbackState.songId
      : null;

  return (
    <div>
      <Link
        href={`/klub100/${project.id}`}
        className="text-sm text-stone-500 hover:underline"
      >
        ← {project.name}
      </Link>
      <h1 className="mb-6 mt-2 text-3xl font-bold">Play mix</h1>

      {isHost ? (
        <PlayScreen
          projectId={project.id}
          projectName={project.name}
          songs={songs}
          spotify={{
            configured: spotifyConfigured(),
            connected: Boolean(account),
            premium: account?.product === "premium",
          }}
          resumeSongId={resumeSongId}
          tracklistTarget={TRACKLIST_SIZE}
        />
      ) : (
        <p className="rounded-xl border border-stone-200 bg-white p-4 text-stone-600 shadow-sm">
          Only the project owner or an admin can host playback — their device
          is the one plugged into the speakers. You just drink. 🍻
        </p>
      )}
    </div>
  );
}
