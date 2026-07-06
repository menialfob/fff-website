import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { cardPad, emptyBox, PageTitle } from "@/components/ui";
import { MarkSeen } from "@/components/mark-seen";
import { CalendarIcon, MessageIcon } from "@/components/icons";
import {
  CategoryAdminControls,
  CreateCategoryForm,
} from "@/modules/forum/category-controls";
import { ensureEventsCategory } from "@/modules/forum/events";

export default async function ForumPage() {
  const session = await requireSession();
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const isAdmin = session.user.role === "ADMIN";

  await ensureEventsCategory();
  const categories = await prisma.forumCategory.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { threads: true } },
      threads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true },
      },
    },
  });

  const displayName = (c: (typeof categories)[number]) =>
    c.isEvents ? t.forum.eventsCategory.name : c.name;
  const displayDesc = (c: (typeof categories)[number]) =>
    c.isEvents ? t.forum.eventsCategory.description : c.description;

  return (
    <div>
      <MarkSeen section="forum" />
      <PageTitle
        sub={t.modules.forum.description}
        actions={isAdmin && <CreateCategoryForm />}
      >
        {t.modules.forum.label}
      </PageTitle>

      {categories.length === 0 ? (
        <p className={emptyBox}>{t.forum.noCategories}</p>
      ) : (
        <ul className="grid gap-3">
          {categories.map((c) => {
            const count = c._count.threads;
            const latest = c.threads[0]?.updatedAt;
            return (
              <li key={c.id} className={cardPad}>
                <Link
                  href={`/forum/c/${c.slug}`}
                  className="group flex items-start gap-4"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${
                      c.isEvents
                        ? "from-lime-400 to-green-500"
                        : "from-blue-400 to-indigo-500"
                    } text-white shadow-lg transition group-hover:scale-105`}
                  >
                    {c.isEvents ? (
                      <CalendarIcon className="h-5 w-5" />
                    ) : (
                      <MessageIcon className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-white group-hover:text-blue-300">
                      {displayName(c)}
                    </span>
                    {displayDesc(c) && (
                      <span className="mt-0.5 block text-sm text-zinc-400">
                        {displayDesc(c)}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-zinc-500">
                      {count === 1
                        ? t.forum.threadCountOne
                        : fmt(t.forum.threadCount, { count })}
                      {latest &&
                        ` · ${fmt(t.forum.lastActivity, {
                          date: formatDate(latest, locale),
                        })}`}
                    </span>
                  </span>
                </Link>
                {isAdmin && !c.isEvents && (
                  <CategoryAdminControls
                    categoryId={c.id}
                    name={c.name}
                    description={c.description}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
