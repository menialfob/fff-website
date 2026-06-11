import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spotifyConfigured } from "@/lib/spotify";
import { NewProjectForm } from "@/modules/klub100/project-controls";
import { SpotifyConnectCard } from "@/modules/klub100/spotify-connect";
import { TRACKLIST_SIZE } from "@/modules/klub100/shared";

export default async function Klub100Page() {
  const session = await requireSession();
  const [projects, ownAccount, slotsUsed] = await Promise.all([
    prisma.klub100Project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true } },
        songs: { select: { status: true, cheers: { select: { id: true } } } },
      },
    }),
    prisma.spotifyAccount.findUnique({
      where: { userId: session.user.id },
      select: { product: true },
    }),
    prisma.spotifyAccount.count(),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">Klub 100</h1>
      <p className="mb-6 text-stone-600">
        100 songs, ~1 minute each, a cheers between every song. Suggest songs,
        pick their best minute and record cheers — together we build the mix.
      </p>
      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-3 text-lg font-semibold">Start a new mix</h2>
        <NewProjectForm />
      </section>
      <div className="mb-8">
        {/* useSearchParams (OAuth result feedback) needs a Suspense boundary */}
        <Suspense>
          <SpotifyConnectCard
            connection={{
              configured: spotifyConfigured(),
              connected: Boolean(ownAccount),
              product: ownAccount?.product ?? null,
              slotsUsed,
            }}
          />
        </Suspense>
      </div>
      {projects.length === 0 ? (
        <p className="text-stone-600">No projects yet — create the first one!</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => {
            const accepted = project.songs.filter((s) => s.status === "ACCEPTED");
            const cheersCount = accepted.filter((s) => s.cheers).length;
            const poolCount = project.songs.filter(
              (s) => s.status === "SUGGESTED",
            ).length;
            return (
              <li key={project.id}>
                <Link
                  href={`/klub100/${project.id}`}
                  className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-400 sm:p-5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold">{project.name}</span>
                    <span className="text-sm text-stone-500">
                      by {project.createdBy.name} ·{" "}
                      {project.createdAt.toLocaleDateString("en-GB")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {accepted.length}/{TRACKLIST_SIZE} songs · {cheersCount}/
                    {TRACKLIST_SIZE} cheers · {poolCount} in pool
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
