import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AttachmentGrid } from "@/modules/files/attachment-grid";
import { toFileDTO } from "@/modules/files/data";
import { fmt, formatDate } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
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
import {
  StructuredFields,
  toRenderFields,
  type RenderField,
} from "@/modules/calendar/structured-fields";
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
        include: { files: {
          orderBy: { createdAt: "asc" },
          include: { uploadedBy: { select: { name: true } } },
        } },
      },
      event: {
        include: { folder: { include: { files: {
          orderBy: { createdAt: "asc" },
          include: { uploadedBy: { select: { name: true } } },
        } } } },
      },
      occurrence: {
        include: {
          event: { include: { fields: { orderBy: { position: "asc" } } } },
          folder: { include: { files: {
          orderBy: { createdAt: "asc" },
          include: { uploadedBy: { select: { name: true } } },
        } } },
          fieldValues: {
            include: {
              person: { select: { name: true } },
              file: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!thread) notFound();

  const canModerate = isAdmin;
  const canDelete = thread.createdById === session.user.id || isAdmin;
  const canReply = !thread.locked || isAdmin;

  const timeLabel = (
    ev: { allDay: boolean; startMinutes: number | null; endMinutes: number | null },
  ) =>
    !ev.allDay && ev.startMinutes !== null
      ? formatMinutes(ev.startMinutes) +
        (ev.endMinutes !== null ? `–${formatMinutes(ev.endMinutes)}` : "")
      : t.calendar.allDay;

  // Live event/occurrence header: render the current event (ad hoc thread) or
  // the specific recurring instance (occurrence thread) rather than a stored
  // copy, so edits reflect instantly. The thread title already carries the
  // (series) title; `when` supplies the concrete date(s).
  const event = thread.event;
  const occ = thread.occurrence;
  let header: {
    when: string;
    time: string;
    location: string | null;
    contentHtml: string | null;
    files: { id: string; name: string; size: number }[];
    folderId: string | null;
    calendarHref: string;
    structuredFields: RenderField[];
  } | null = null;

  if (event) {
    let when = "";
    if (event.kind === "RECURRING" && event.freq) {
      const rule: RecurrenceRule = {
        freq: event.freq,
        weekday: event.weekday,
        ordinal: event.ordinal,
        month: event.month,
        dayOfMonth: event.dayOfMonth,
      };
      when = describeRule(rule, locale, t.calendar.recurrence);
    } else if (event.date) {
      when = formatISODate(event.date, locale);
    }
    header = {
      when,
      time: timeLabel(event),
      location: event.location,
      contentHtml: renderContent(event.contentJson),
      files: event.folder?.files ?? [],
      folderId: event.folder?.id ?? null,
      calendarHref: `/calendar/${event.id}`,
      // Structured fields are per recurring occurrence, not per series/ad hoc.
      structuredFields: [],
    };
  } else if (occ) {
    header = {
      when: formatISODate(occ.date, locale),
      time: timeLabel(occ.event),
      location: occ.event.location,
      contentHtml: renderContent(occ.contentJson),
      files: occ.folder?.files ?? [],
      folderId: occ.folder?.id ?? null,
      calendarHref: `/calendar/${occ.event.id}?d=${occ.date}`,
      structuredFields: toRenderFields(occ.event.fields, occ.fieldValues),
    };
  }

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

      <PageTitle
        actions={
          (canModerate || canDelete) && (
            <ThreadControls
              threadId={thread.id}
              pinned={thread.pinned}
              locked={thread.locked}
              canModerate={canModerate}
              canDelete={canDelete}
            />
          )
        }
      >
        {thread.title}
      </PageTitle>

      {/* Live event/occurrence header for event-linked threads */}
      {header && (
        <section className={`${cardPad} mb-6`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-lime-300" />
            <Link
              href={header.calendarHref}
              className="text-sm font-medium text-lime-300 hover:underline"
            >
              {t.forum.openEvent}
            </Link>
          </div>
          <dl className="grid gap-1 text-sm text-zinc-300">
            {header.when && (
              <div className="first-letter:uppercase">{header.when}</div>
            )}
            {header.time && <div>{header.time}</div>}
            {header.location && (
              <div>
                {t.calendar.location}: {header.location}
              </div>
            )}
          </dl>
          {header.contentHtml && (
            <div
              className="event-content mt-3"
              dangerouslySetInnerHTML={{ __html: header.contentHtml }}
            />
          )}
          {header.structuredFields.length > 0 && (
            <div className="mt-4">
              <StructuredFields fields={header.structuredFields} />
            </div>
          )}
          {header.files.length > 0 && header.folderId && (
            <div className="mt-4">
              <Link
                href={`/files/${header.folderId}`}
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
        header ? (
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
      {thread.folder && (
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
          {thread.folder.files.length > 0 ? (
            <AttachmentGrid files={thread.folder.files.map(toFileDTO)} />
          ) : (
            <p className="text-sm text-zinc-500">{t.files.empty}</p>
          )}
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
