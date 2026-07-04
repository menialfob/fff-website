import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/i18n";
import { getDict } from "@/lib/i18n/server";
import { btnSecondary, cardPad } from "@/components/ui";
import {
  ArrowLeftIcon,
  DownloadIcon,
  PlayIcon,
} from "@/components/icons";
import { DeleteProjectButton } from "@/modules/klub100/project-controls";
import { ProjectAdminManager } from "@/modules/klub100/project-admins";
import { SuggestSongButton } from "@/modules/klub100/suggest-song";
import { SuggestionPool } from "@/modules/klub100/suggestion-pool";
import { Tracklist } from "@/modules/klub100/tracklist";
import {
  computeIsCurator,
  TRACKLIST_SIZE,
  type SongView,
} from "@/modules/klub100/shared";

export default async function Klub100ProjectPage({
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
      createdBy: { select: { id: true, name: true } },
      admins: { select: { userId: true } },
      songs: {
        include: {
          suggestedBy: { select: { name: true } },
          cheers: { include: { recordedBy: { select: { name: true } } } },
          votes: { select: { userId: true } },
        },
      },
    },
  });
  if (!project) notFound();

  const isCurator = computeIsCurator(project, session.user);

  // Members the curator can pick from when managing project admins.
  const members = isCurator
    ? await prisma.user.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const songs: SongView[] = project.songs.map((s) => ({
    id: s.id,
    status: s.status,
    position: s.position,
    spotifyTrackId: s.spotifyTrackId,
    spotifyUrl: s.spotifyUrl,
    title: s.title,
    artist: s.artist,
    album: s.album,
    durationMs: s.durationMs,
    albumArtUrl: s.albumArtUrl,
    seg1StartMs: s.seg1StartMs,
    seg1EndMs: s.seg1EndMs,
    seg2StartMs: s.seg2StartMs,
    seg2EndMs: s.seg2EndMs,
    placement: s.placement,
    placementNote: s.placementNote,
    suggestedById: s.suggestedById,
    suggestedByName: s.suggestedBy.name,
    hasCheers: Boolean(s.cheers),
    cheersByName: s.cheers?.recordedBy.name ?? null,
    voteCount: s.votes.length,
    votedByMe: s.votes.some((v) => v.userId === session.user.id),
  }));

  const accepted = songs
    .filter((s) => s.status === "ACCEPTED")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const suggested = songs
    .filter((s) => s.status === "SUGGESTED")
    .sort((a, b) => b.voteCount - a.voteCount);
  const rejected = songs.filter((s) => s.status === "REJECTED");
  const cheersCount = accepted.filter((s) => s.hasCheers).length;

  return (
    <div>
      <Link
        href="/klub100"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.klub100.allProjects}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {project.name}
        </h1>
        <span className="text-sm text-zinc-500">
          {fmt(t.klub100.by, { name: project.createdBy.name })}
        </span>
      </div>

      <section className={`${cardPad} mt-4`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Progress
            label={t.klub100.songs}
            value={accepted.length}
            barClass="from-fuchsia-500 to-pink-500"
          />
          <Progress
            label={t.klub100.cheers}
            value={cheersCount}
            barClass="from-amber-400 to-orange-500"
          />
          <span className="flex-1" />
          <Link
            href={`/klub100/${project.id}/play`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 active:scale-[0.98]"
          >
            <PlayIcon className="h-4 w-4" />
            {t.klub100.playMix}
          </Link>
          {isCurator && (
            <a
              href={`/api/klub100/export/${project.id}`}
              className={btnSecondary}
            >
              <DownloadIcon className="h-4 w-4" />
              {t.klub100.exportPackage}
            </a>
          )}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">
          {t.klub100.tracklist} ({accepted.length}/{TRACKLIST_SIZE})
        </h2>
        <SuggestSongButton projectId={project.id} />
      </div>
      <div className="mt-3">
        <Tracklist
          songs={accepted}
          isCurator={isCurator}
          currentUserId={session.user.id}
        />
      </div>

      <h2 className="mt-10 text-xl font-semibold text-white">
        {t.klub100.suggestionPool} ({suggested.length})
      </h2>
      <p className="mb-3 mt-1 text-sm text-zinc-400">
        {t.klub100.poolHint}
        {isCurator && t.klub100.poolHintCurator}.
      </p>
      <SuggestionPool
        suggested={suggested}
        rejected={rejected}
        isCurator={isCurator}
        currentUserId={session.user.id}
      />

      {isCurator && (
        <div className="mt-12 space-y-8 border-t border-white/10 pt-6">
          <ProjectAdminManager
            projectId={project.id}
            creator={{ id: project.createdBy.id, name: project.createdBy.name }}
            adminUserIds={project.admins.map((a) => a.userId)}
            members={members}
          />
          <DeleteProjectButton projectId={project.id} />
        </div>
      )}
    </div>
  );
}

function Progress({
  label,
  value,
  barClass,
}: {
  label: string;
  value: number;
  barClass: string;
}) {
  const pct = Math.min((value / TRACKLIST_SIZE) * 100, 100);
  return (
    <div className="min-w-36">
      <p className="text-sm">
        <span className="font-medium text-zinc-200">{label}</span>{" "}
        <span className="text-zinc-500">
          {value}/{TRACKLIST_SIZE}
        </span>
      </p>
      <div className="mt-1.5 h-2 rounded-full bg-white/10">
        <div
          className={`h-2 rounded-full bg-gradient-to-r ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
