import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt, formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { formatSize } from "@/lib/format";
import { cardPad, emptyBox, PageTitle } from "@/components/ui";
import {
  ArrowLeftIcon,
  CalendarIcon,
  FolderIcon,
  LockIcon,
} from "@/components/icons";
import { renderContent } from "@/modules/content/render";
import {
  describeRule,
  formatISODate,
  formatMinutes,
  type RecurrenceRule,
} from "@/modules/calendar/recurrence";
import { PostControls } from "@/modules/forum/post-controls";
import { ReplyForm } from "@/modules/forum/reply-form";
import { ThreadControls } from "@/modules/forum/thread-controls";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);
  const isAdmin = session.user.role === "ADMIN";

  const thread = await prisma.forumThread.findUnique({
    where: { id },
    include: {
      category: { select: { slug: true, name: true, isEvents: true } },
      createdBy: { select: { name: true } },
      posts: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      folder: {
        include: { files: { orderBy: { createdAt: "asc" } } },
      },
      event: {
        include: { folder: { include: { files: { orderBy: { createdAt: "asc" } } } } },
      },
    },
  });
  if (!thread) notFound();

  const canModerate = isAdmin;
  const canDelete = thread.createdById === session.user.id || isAdmin;
  const canReply = !thread.locked || isAdmin;

  // Live event header (event-linked threads only): render the current event
  // rather than a stored copy, so edits reflect instantly.
  const event = thread.event;
  let eventWhen = "";
  let eventTime = "";
  let eventContentHtml: string | null = null;
  if (event) {
    if (event.kind === "RECURRING" && event.freq) {
      const rule: RecurrenceRule = {
        freq: event.freq,
        weekday: event.weekday,
        ordinal: event.ordinal,
        month: event.month,
        dayOfMonth: event.dayOfMonth,
      };
      eventWhen = describeRule(rule, locale, t.calendar.recurrence);
    } else if (event.date) {
      eventWhen = formatISODate(event.date, locale);
    }
    if (!event.allDay && event.startMinutes !== null) {
      eventTime =
        formatMinutes(event.startMinutes) +
        (event.endMinutes !== null ? `–${formatMinutes(event.endMinutes)}` : "");
    } else {
      eventTime = t.calendar.allDay;
    }
    eventContentHtml = renderContent(event.contentJson);
  }
  const eventFiles = event?.folder?.files ?? [];

  return (
    <div>
      <Link
        href={`/forum/c/${thread.category.slug}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {thread.category.isEvents
          ? t.forum.eventsCategory.name
          : thread.category.name}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{thread.title}</PageTitle>
        {(canModerate || canDelete) && (
          <ThreadControls
            threadId={thread.id}
            pinned={thread.pinned}
            locked={thread.locked}
            canModerate={canModerate}
            canDelete={canDelete}
          />
        )}
      </div>

      {/* Event header for event-linked threads */}
      {event && (
        <section className={`${cardPad} mb-6`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-lime-300" />
            <Link
              href={`/calendar/${event.id}`}
              className="text-sm font-medium text-lime-300 hover:underline"
            >
              {t.forum.openEvent}
            </Link>
          </div>
          <dl className="grid gap-1 text-sm text-zinc-300">
            {eventWhen && <div className="first-letter:uppercase">{eventWhen}</div>}
            {eventTime && <div>{eventTime}</div>}
            {event.location && (
              <div>
                {t.calendar.location}: {event.location}
              </div>
            )}
          </dl>
          {eventContentHtml && (
            <div
              className="event-content mt-3"
              dangerouslySetInnerHTML={{ __html: eventContentHtml }}
            />
          )}
          {eventFiles.length > 0 && event.folder && (
            <div className="mt-4">
              <Link
                href={`/files/${event.folder.id}`}
                className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:underline"
              >
                <FolderIcon className="h-4 w-4" />
                {t.calendar.openFolder}
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Posts */}
      {thread.posts.length === 0 ? (
        event ? (
          <p className={`${emptyBox} mb-6`}>{t.forum.noRepliesYet}</p>
        ) : null
      ) : (
        <ul className="mb-6 grid gap-4">
          {thread.posts.map((post) => {
            const html = renderContent(post.contentJson);
            const canEdit =
              post.createdById === session.user.id || isAdmin;
            return (
              <li key={post.id} className={cardPad}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-zinc-400">
                    {fmt(t.forum.postMeta, {
                      author: post.createdBy?.name ?? t.forum.unknownAuthor,
                      date: formatDate(post.createdAt, locale),
                    })}
                    {post.editedAt && (
                      <span className="text-zinc-600"> · {t.forum.edited}</span>
                    )}
                  </span>
                  {canEdit && (
                    <PostControls postId={post.id} threadId={thread.id} />
                  )}
                </div>
                {html ? (
                  <div
                    className="event-content"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Thread attachments folder */}
      {thread.folder && thread.folder.files.length > 0 && (
        <section className={`${cardPad} mb-6`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">
              {t.forum.attachments}
            </h2>
            <Link
              href={`/files/${thread.folder.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:underline"
            >
              <FolderIcon className="h-4 w-4" />
              {t.calendar.openFolder}
            </Link>
          </div>
          <ul className="grid gap-2">
            {thread.folder.files.map((file) => (
              <li key={file.id}>
                <a
                  href={`/api/files/${file.id}`}
                  className="font-medium text-zinc-100 hover:text-sky-300 hover:underline"
                >
                  {file.name}
                </a>{" "}
                <span className="text-sm text-zinc-500">
                  {formatSize(file.size)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Reply */}
      {canReply ? (
        <ReplyForm threadId={thread.id} />
      ) : (
        <p className="inline-flex items-center gap-2 text-sm text-zinc-500">
          <LockIcon className="h-4 w-4" />
          {t.forum.lockedNotice}
        </p>
      )}
    </div>
  );
}
