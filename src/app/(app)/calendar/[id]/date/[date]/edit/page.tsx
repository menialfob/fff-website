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

  // Field definitions come from the event (not the occurrence), so the form
  // lists all fields even before this date has any saved values. Members are
  // all users (including inactive) so a previously-picked person still has an
  // option. Existing values (if the occurrence exists) pre-fill the inputs.
  const [occurrence, fields, members] = await Promise.all([
    prisma.calendarOccurrence.findUnique({
      where: { eventId_date: { eventId: id, date } },
      include: {
        fieldValues: {
          include: { file: { select: { id: true, name: true, size: true } } },
        },
      },
    }),
    prisma.eventField.findMany({
      where: { eventId: id },
      orderBy: { position: "asc" },
      select: { id: true, label: true, type: true },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const initialValues = Object.fromEntries(
    (occurrence?.fieldValues ?? []).map((v) => [
      v.fieldId,
      { text: v.text, personId: v.personId, file: v.file },
    ]),
  );

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
        fields={fields}
        members={members}
        initialValues={initialValues}
      />
    </div>
  );
}
