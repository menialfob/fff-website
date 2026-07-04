import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spotifyConfigured } from "@/lib/spotify";
import { fmt, formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { cardHover, cardPad, emptyBox, PageTitle } from "@/components/ui";
import { NewProjectForm } from "@/modules/klub100/project-controls";
import { SpotifyConnectCard } from "@/modules/klub100/spotify-connect";
import { TRACKLIST_SIZE } from "@/modules/klub100/shared";

export default async function Klub100Page() {
  const session = await requireSession();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
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
      <PageTitle sub={t.klub100.intro}>{t.modules.klub100.label}</PageTitle>
      <section className={`${cardPad} mb-8`}>
        <h2 className="mb-3 text-lg font-semibold text-white">
          {t.klub100.newMixTitle}
        </h2>
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
        <p className={emptyBox}>{t.klub100.noProjects}</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => {
            const accepted = project.songs.filter(
              (s) => s.status === "ACCEPTED",
            );
            const cheersCount = accepted.filter((s) => s.cheers).length;
            const poolCount = project.songs.filter(
              (s) => s.status === "SUGGESTED",
            ).length;
            return (
              <li key={project.id}>
                <Link
                  href={`/klub100/${project.id}`}
                  className={`${cardHover} block p-4 sm:p-5`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold text-white">
                      {project.name}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {fmt(t.klub100.byOn, {
                        name: project.createdBy.name,
                        date: formatDate(project.createdAt, locale),
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">
                    {fmt(t.klub100.projectStats, {
                      songs: accepted.length,
                      cheers: cheersCount,
                      pool: poolCount,
                      total: TRACKLIST_SIZE,
                    })}
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
