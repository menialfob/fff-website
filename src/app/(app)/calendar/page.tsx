import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict, getLocale } from "@/lib/i18n/server";
import { btnSecondary, PageTitle } from "@/components/ui";
import { MarkSeen } from "@/components/mark-seen";
import { MonthView, type MonthOccurrence } from "@/modules/calendar/month-view";
import type { RecurrenceRule } from "@/modules/calendar/recurrence";
import {
  addDays,
  daysInMonth,
  occurrenceInMonth,
  todayInCopenhagen,
  toISODate,
} from "@/modules/calendar/recurrence";

function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; day?: string }>;
}) {
  await requireSession();
  const { m, day } = await searchParams;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const today = todayInCopenhagen();
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const requested = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null;
  if (requested) {
    year = Number(requested.slice(0, 4));
    month = Number(requested.slice(5, 7));
  }

  // A day picked before opening an event comes back on ?day=, so the list
  // stays narrowed to it; ignored unless it falls in the month shown.
  const selectedDay =
    day &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    day.slice(0, 7) === monthParam(year, month)
      ? day
      : null;

  const monthStart = toISODate(year, month, 1);
  const monthEnd = toISODate(year, month, daysInMonth(year, month));

  const [adhocEvents, recurringEvents] = await Promise.all([
    // Any ad hoc event whose [date, endDate] range overlaps the month —
    // multi-day events show up even when they started last month.
    prisma.calendarEvent.findMany({
      where: {
        kind: "ADHOC",
        date: { lte: monthEnd },
        OR: [
          { endDate: null, date: { gte: monthStart } },
          { endDate: { gte: monthStart } },
        ],
      },
    }),
    prisma.calendarEvent.findMany({ where: { kind: "RECURRING" } }),
  ]);

  const occurrences: MonthOccurrence[] = adhocEvents.map((e) => ({
    date: e.date!,
    endDate: e.endDate,
    event: e,
  }));
  for (const e of recurringEvents) {
    if (!e.freq) continue;
    const rule: RecurrenceRule = {
      freq: e.freq,
      weekday: e.weekday,
      ordinal: e.ordinal,
      month: e.month,
      dayOfMonth: e.dayOfMonth,
    };
    // Check the previous month too: a multi-day occurrence near the end of
    // it can spill into the first days of this one.
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    for (const [y, m] of [
      [prevYear, prevMonth],
      [year, month],
    ] as const) {
      const date = occurrenceInMonth(rule, y, m);
      if (!date) continue;
      const endDate = e.endDayOffset ? addDays(date, e.endDayOffset) : null;
      const lastDay = endDate ?? date;
      if (date > monthEnd || lastDay < monthStart) continue;
      occurrences.push({ date, endDate, event: e });
    }
  }
  occurrences.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.event.startMinutes ?? -1) - (b.event.startMinutes ?? -1),
  );

  const prev = month === 1 ? monthParam(year - 1, 12) : monthParam(year, month - 1);
  const next = month === 12 ? monthParam(year + 1, 1) : monthParam(year, month + 1);
  const monthLabel = new Intl.DateTimeFormat(
    locale === "da" ? "da-DK" : "en-GB",
    { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div>
      <MarkSeen section="calendar" />
      <PageTitle>{t.modules.calendar.label}</PageTitle>

      <MonthView
        key={`${year}-${month}`}
        year={year}
        month={month}
        today={today}
        initialSelected={selectedDay}
        occurrences={occurrences.map((occ) => ({
          date: occ.date,
          endDate: occ.endDate,
          event: {
            id: occ.event.id,
            kind: occ.event.kind,
            title: occ.event.title,
            allDay: occ.event.allDay,
            startMinutes: occ.event.startMinutes,
            endMinutes: occ.event.endMinutes,
            location: occ.event.location,
          },
        }))}
        header={
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={`/calendar?m=${prev}`}
              aria-label={t.calendar.prevMonth}
              className={btnSecondary}
            >
              ‹
            </Link>
            <h2 className="text-lg font-semibold capitalize text-white">
              {monthLabel}
            </h2>
            <Link
              href={`/calendar?m=${next}`}
              aria-label={t.calendar.nextMonth}
              className={btnSecondary}
            >
              ›
            </Link>
          </div>
        }
      />
    </div>
  );
}
