import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spotifyConfigured } from "@/lib/spotify";
import { getDict } from "@/lib/i18n/server";
import { cardPad, PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { PlayScreen } from "@/modules/klub100/play-screen";
import { computeIsCurator, TRACKLIST_SIZE } from "@/modules/klub100/shared";
import type { PlaybackSong } from "@/modules/klub100/playback-engine";

export default async function Klub100PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const t = await getDict();

  const project = await prisma.klub100Project.findUnique({
    where: { id },
    include: {
      playbackState: true,
      admins: { select: { userId: true } },
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

  const isHost = computeIsCurator(project, session.user);

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
    project.playbackState &&
    songs.some((s) => s.id === project.playbackState!.songId)
      ? project.playbackState.songId
      : null;

  return (
    <div>
      <Link
        href={`/klub100/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {project.name}
      </Link>
      <div className="mt-2">
        <PageTitle>{t.klub100.playMixTitle}</PageTitle>
      </div>

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
        <p className={`${cardPad} text-zinc-400`}>{t.klub100.onlyHostInfo}</p>
      )}
    </div>
  );
}
