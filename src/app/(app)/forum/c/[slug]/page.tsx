import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import {
  btnPrimary,
  cardHover,
  emptyBox,
  listCard,
  PageTitle,
} from "@/components/ui";
import { ArrowLeftIcon, CalendarIcon, PlusIcon } from "@/components/icons";
import { formatISODate } from "@/modules/calendar/recurrence";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireSession();
  const { slug } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const category = await prisma.forumCategory.findUnique({
    where: { slug },
    include: {
      threads: {
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          occurrence: { select: { date: true } },
          _count: { select: { posts: true } },
        },
      },
    },
  });
  if (!category) notFound();

  const name = category.isEvents ? t.forum.eventsCategory.name : category.name;

  return (
    <div>
      <Link
        href="/forum"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.modules.forum.label}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{name}</PageTitle>
        {!category.isEvents && (
          <Link href={`/forum/c/${category.slug}/new`} className={btnPrimary}>
            <PlusIcon className="h-4 w-4" />
            {t.forum.newThread}
          </Link>
        )}
      </div>

      {category.isEvents && (
        <p className="mb-4 text-sm text-zinc-500">{t.forum.eventsCategoryHint}</p>
      )}

      {category.threads.length === 0 ? (
        <p className={emptyBox}>{t.forum.noThreads}</p>
      ) : (
        <ul className={listCard}>
          {category.threads.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/forum/t/${thread.id}`}
                className={`${cardHover} flex flex-wrap items-center gap-x-3 gap-y-1 border-0 bg-transparent px-4 py-3 shadow-none sm:px-6`}
              >
                {(thread.eventId || thread.occurrenceId) && (
                  <CalendarIcon className="h-4 w-4 shrink-0 text-lime-300" />
                )}
                <span className="min-w-0 font-medium text-zinc-100">
                  {thread.title}
                  {thread.occurrence && (
                    <span className="text-zinc-500">
                      {" "}
                      · {formatISODate(thread.occurrence.date, locale)}
                    </span>
                  )}
                </span>
                {thread.pinned && (
                  <span className="rounded-full bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                    {t.forum.pinned}
                  </span>
                )}
                {thread.locked && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                    {t.forum.locked}
                  </span>
                )}
                <span className="flex-1" />
                <span className="text-sm text-zinc-500">
                  {thread.createdBy
                    ? fmt(t.forum.threadMeta, {
                        author: thread.createdBy.name,
                        date: formatDate(thread.updatedAt, locale),
                      })
                    : formatDate(thread.updatedAt, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
