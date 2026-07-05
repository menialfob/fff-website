import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict, getLocale } from "@/lib/i18n/server";
import { btnSecondary, PageTitle } from "@/components/ui";
import { MonthView, type MonthOccurrence } from "@/modules/calendar/month-view";
import type { RecurrenceRule } from "@/modules/calendar/recurrence";
import {
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
  searchParams: Promise<{ m?: string }>;
}) {
  await requireSession();
  const { m } = await searchParams;
  const [t, locale] = await Promise.all([getDict(), getLocale()]);

  const today = todayInCopenhagen();
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const requested = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null;
  if (requested) {
    year = Number(requested.slice(0, 4));
    month = Number(requested.slice(5, 7));
  }

  const monthStart = toISODate(year, month, 1);
  const monthEnd = toISODate(year, month, daysInMonth(year, month));

  const [adhocEvents, recurringEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { kind: "ADHOC", date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.calendarEvent.findMany({ where: { kind: "RECURRING" } }),
  ]);

  const occurrences: MonthOccurrence[] = adhocEvents.map((e) => ({
    date: e.date!,
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
    const date = occurrenceInMonth(rule, year, month);
    if (date) occurrences.push({ date, event: e });
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
      <PageTitle>{t.modules.calendar.label}</PageTitle>

      <MonthView
        key={`${year}-${month}`}
        year={year}
        month={month}
        today={today}
        occurrences={occurrences.map((occ) => ({
          date: occ.date,
          event: {
            id: occ.event.id,
            kind: occ.event.kind,
            title: occ.event.title,
            allDay: occ.event.allDay,
            startMinutes: occ.event.startMinutes,
            durationMinutes: occ.event.durationMinutes,
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
