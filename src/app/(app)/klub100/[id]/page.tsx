import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
      <Link href="/klub100" className="text-sm text-stone-500 hover:underline">
        ← All projects
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <span className="text-sm text-stone-500">by {project.createdBy.name}</span>
      </div>

      <section className="mt-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Progress label="Songs" value={accepted.length} />
          <Progress label="Cheers" value={cheersCount} />
          <span className="flex-1" />
          <Link
            href={`/klub100/${project.id}/play`}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            ▶ Play mix
          </Link>
          {isCurator && (
            <a
              href={`/api/klub100/export/${project.id}`}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100"
            >
              ⬇ Export package
            </a>
          )}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          Tracklist ({accepted.length}/{TRACKLIST_SIZE})
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

      <h2 className="mt-8 text-xl font-semibold">
        Suggestion pool ({suggested.length})
      </h2>
      <p className="mb-3 mt-1 text-sm text-stone-600">
        Vote for the songs that deserve a spot
        {isCurator && " — accept the best ones onto the tracklist"}.
      </p>
      <SuggestionPool
        suggested={suggested}
        rejected={rejected}
        isCurator={isCurator}
        currentUserId={session.user.id}
      />

      {isCurator && (
        <div className="mt-10 space-y-8 border-t border-stone-200 pt-6">
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

function Progress({ label, value }: { label: string; value: number }) {
  const pct = Math.min((value / TRACKLIST_SIZE) * 100, 100);
  return (
    <div className="min-w-36">
      <p className="text-sm">
        <span className="font-medium">{label}</span>{" "}
        <span className="text-stone-500">
          {value}/{TRACKLIST_SIZE}
        </span>
      </p>
      <div className="mt-1 h-2 rounded-full bg-stone-200">
        <div
          className="h-2 rounded-full bg-stone-900"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
