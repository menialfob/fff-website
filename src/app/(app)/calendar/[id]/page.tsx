import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { formatSize } from "@/lib/format";
import { btnSecondary, cardPad, PageTitle } from "@/components/ui";
import { ArrowLeftIcon, FolderIcon, PencilIcon } from "@/components/icons";
import { EventControls } from "@/modules/calendar/event-controls";
import { renderContent } from "@/modules/content/render";
import {
  describeRule,
  formatISODate,
  formatMinutes,
  isOccurrenceDate,
  nextOccurrences,
  todayInCopenhagen,
  type RecurrenceRule,
} from "@/modules/calendar/recurrence";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { d } = await searchParams;
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

  // Recurring events focus one occurrence date: the ?d= from the month
  // list if it belongs to the rule, otherwise the next one from today.
  // Description and attachments are per date (CalendarOccurrence).
  const today = todayInCopenhagen();
  const focusDate = rule
    ? d && isOccurrenceDate(rule, d)
      ? d
      : (nextOccurrences(rule, today, 1)[0] ?? null)
    : null;
  const occurrence =
    rule && focusDate
      ? await prisma.calendarOccurrence.findUnique({
          where: { eventId_date: { eventId: event.id, date: focusDate } },
          include: {
            folder: {
              include: { files: { orderBy: { createdAt: "asc" } } },
            },
          },
        })
      : null;

  const upcoming = rule ? nextOccurrences(rule, today, 3) : [];

  // Multi-day ad hoc events show explicit start/end lines instead of a
  // single date + time; recurring multi-day ones annotate the time range
  // with the day span (each occurrence's concrete dates vary).
  const multiDayAdhoc = Boolean(
    event.kind === "ADHOC" &&
      event.date &&
      event.endDate &&
      event.endDate > event.date,
  );
  const dayOffset = event.endDayOffset ?? 0;
  const daySuffix =
    dayOffset > 0 ? ` (${fmt(t.calendar.plusDays, { count: dayOffset })})` : "";
  const time = event.allDay
    ? t.calendar.allDay + daySuffix
    : event.startMinutes !== null
      ? formatMinutes(event.startMinutes) +
        (event.endMinutes !== null
          ? `–${formatMinutes(event.endMinutes)}`
          : "") +
        daySuffix
      : "";
  const dateAtTime = (date: string, minutes: number | null) =>
    minutes === null || event.allDay
      ? formatISODate(date, locale)
      : fmt(t.calendar.dateAtTime, {
          date: formatISODate(date, locale),
          time: formatMinutes(minutes),
        });

  const contentHtml = renderContent(
    rule ? (occurrence?.contentJson ?? null) : event.contentJson,
  );
  const assetFolder = rule ? (occurrence?.folder ?? null) : event.folder;
  const attachments = assetFolder?.files ?? [];

  return (
    <div>
      <Link
        href="/calendar"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t.modules.calendar.label}
      </Link>

      <PageTitle
        actions={canManage && <EventControls eventId={event.id} />}
      >
        {event.title}
      </PageTitle>

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
          {multiDayAdhoc && event.date && event.endDate ? (
            <>
              <div className="first-letter:uppercase">
                {t.calendar.starts}: {dateAtTime(event.date, event.startMinutes)}
              </div>
              <div className="first-letter:uppercase">
                {t.calendar.ends}: {dateAtTime(event.endDate, event.endMinutes)}
              </div>
            </>
          ) : (
            <>
              <div>
                {rule
                  ? describeRule(rule, locale, t.calendar.recurrence)
                  : event.date
                    ? formatISODate(event.date, locale)
                    : ""}
              </div>
              {time && <div>{time}</div>}
            </>
          )}
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
            <ul className="grid gap-0.5 text-sm">
              {upcoming.map((date) => (
                <li key={date}>
                  <Link
                    href={`/calendar/${event.id}?d=${date}`}
                    className={
                      date === focusDate
                        ? "font-medium text-lime-300"
                        : "text-zinc-300 hover:text-white hover:underline"
                    }
                  >
                    {formatISODate(date, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {rule && focusDate && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white first-letter:uppercase">
            {formatISODate(focusDate, locale)}
          </h2>
          {canManage && (
            <Link
              href={`/calendar/${event.id}/date/${focusDate}/edit`}
              className={btnSecondary}
            >
              <PencilIcon className="h-4 w-4" />
              {t.calendar.editOccurrence}
            </Link>
          )}
        </div>
      )}

      {contentHtml ? (
        <section className={`${cardPad} mb-6`}>
          <div
            className="event-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </section>
      ) : (
        rule &&
        focusDate && (
          <p className="mb-6 text-sm text-zinc-500">
            {t.calendar.noOccurrenceContent}
          </p>
        )
      )}

      {attachments.length > 0 && assetFolder && (
        <section className={`${cardPad} mb-6`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">
              {t.calendar.attachments}
            </h2>
            <Link
              href={`/files/${assetFolder.id}`}
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
