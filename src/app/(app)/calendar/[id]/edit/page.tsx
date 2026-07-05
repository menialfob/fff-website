import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { PageTitle } from "@/components/ui";
import { ArrowLeftIcon } from "@/components/icons";
import { EventForm } from "@/modules/calendar/event-form";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const t = await getDict();

  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event) notFound();

  const canRecurring =
    session.user.role === "ADMIN" ||
    session.user.extraRoles.includes("BESTYRELSE");
  // Server actions enforce this too; redirecting here just avoids showing a
  // form that could never be submitted.
  if (event.kind === "RECURRING" && !canRecurring) {
    redirect(`/calendar/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/calendar/${id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {event.title}
      </Link>
      <PageTitle>{t.calendar.editEvent}</PageTitle>
      <EventForm
        canRecurring={canRecurring}
        event={{
          id: event.id,
          kind: event.kind,
          title: event.title,
          location: event.location,
          allDay: event.allDay,
          startMinutes: event.startMinutes,
          endMinutes: event.endMinutes,
          date: event.date,
          endDate: event.endDate,
          endDayOffset: event.endDayOffset,
          freq: event.freq,
          weekday: event.weekday,
          ordinal: event.ordinal,
          month: event.month,
          dayOfMonth: event.dayOfMonth,
          contentJson: event.contentJson,
        }}
      />
    </div>
  );
}
