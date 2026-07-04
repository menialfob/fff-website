import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { formatSize } from "@/lib/format";
import { cardPad, PageTitle } from "@/components/ui";
import { ArrowLeftIcon, FolderIcon } from "@/components/icons";
import { EventControls } from "@/modules/calendar/event-controls";
import { renderEventContent } from "@/modules/calendar/render";
import {
  describeRule,
  formatISODate,
  formatMinutes,
  nextOccurrences,
  todayInCopenhagen,
  type RecurrenceRule,
} from "@/modules/calendar/recurrence";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      folder: {
        include: { files: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!event) notFound();

  const canManage =
    event.kind === "ADHOC" ||
    session.user.role === "ADMIN" ||
    session.user.extraRoles.includes("BESTYRELSE");

  const rule: RecurrenceRule | null =
    event.kind === "RECURRING" && event.freq
      ? {
          freq: event.freq,
          weekday: event.weekday,
          ordinal: event.ordinal,
          month: event.month,
          dayOfMonth: event.dayOfMonth,
        }
      : null;
  const upcoming = rule
    ? nextOccurrences(rule, todayInCopenhagen(), 3)
    : [];

  const time = event.allDay
    ? t.calendar.allDay
    : event.startMinutes !== null
      ? formatMinutes(event.startMinutes) +
        (event.durationMinutes
          ? `–${formatMinutes(event.startMinutes + event.durationMinutes)}`
          : "")
      : "";

  const contentHtml = renderEventContent(event.contentJson);
  const attachments = event.folder?.files ?? [];

  return (
    <div>
      <Link
        href="/calendar"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.modules.calendar.label}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{event.title}</PageTitle>
        {canManage && <EventControls eventId={event.id} />}
      </div>

      <section className={`${cardPad} mb-6`}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              event.kind === "RECURRING"
                ? "bg-lime-400/10 text-lime-300"
                : "bg-amber-400/10 text-amber-300"
            }`}
          >
            {event.kind === "RECURRING"
              ? t.calendar.recurringBadge
              : t.calendar.adhocBadge}
          </span>
          {event.createdBy && (
            <span className="text-xs text-zinc-500">
              {fmt(t.calendar.createdBy, { name: event.createdBy.name })}
            </span>
          )}
        </div>
        <dl className="mt-3 grid gap-1 text-sm text-zinc-300">
          <div>
            {rule
              ? describeRule(rule, locale, t.calendar.recurrence)
              : event.date
                ? formatISODate(event.date, locale)
                : ""}
          </div>
          {time && <div>{time}</div>}
          {event.location && (
            <div>
              {t.calendar.location}: {event.location}
            </div>
          )}
        </dl>
        {upcoming.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {t.calendar.nextOccurrences}
            </h3>
            <ul className="grid gap-0.5 text-sm text-zinc-300">
              {upcoming.map((date) => (
                <li key={date}>{formatISODate(date, locale)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {contentHtml && (
        <section className={`${cardPad} mb-6`}>
          <div
            className="event-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </section>
      )}

      {attachments.length > 0 && event.folder && (
        <section className={`${cardPad} mb-6`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">
              {t.calendar.attachments}
            </h2>
            <Link
              href={`/files/${event.folder.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:underline"
            >
              <FolderIcon className="h-4 w-4" />
              {t.calendar.openFolder}
            </Link>
          </div>
          <ul className="grid gap-2">
            {attachments.map((file) => (
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
    </div>
  );
}
