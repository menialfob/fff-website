import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/i18n";
import { getDict, getLocale } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { OccurrenceContentForm } from "@/modules/calendar/occurrence-form";
import {
  formatISODate,
  isOccurrenceDate,
} from "@/modules/calendar/recurrence";

export default async function EditOccurrencePage({
  params,
}: {
  params: Promise<{ id: string; date: string }>;
}) {
  const session = await requireSession();
  const { id, date } = await params;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event || event.kind !== "RECURRING" || !event.freq) notFound();

  const canManage =
    session.user.role === "ADMIN" ||
    session.user.extraRoles.includes("BESTYRELSE");
  if (!canManage) redirect(`/calendar/${id}`);

  const rule = {
    freq: event.freq,
    weekday: event.weekday,
    ordinal: event.ordinal,
    month: event.month,
    dayOfMonth: event.dayOfMonth,
  };
  if (!isOccurrenceDate(rule, date)) redirect(`/calendar/${id}`);

  const occurrence = await prisma.calendarOccurrence.findUnique({
    where: { eventId_date: { eventId: id, date } },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/calendar/${id}?d=${date}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {event.title}
      </Link>
      <PageTitle
        sub={fmt(t.calendar.occurrenceEditSub, {
          date: formatISODate(date, locale),
        })}
      >
        {t.calendar.editOccurrence}
      </PageTitle>
      <OccurrenceContentForm
        eventId={id}
        date={date}
        initialContent={occurrence?.contentJson ?? null}
      />
    </div>
  );
}
