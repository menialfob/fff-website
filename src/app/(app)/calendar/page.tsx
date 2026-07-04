import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict, getLocale } from "@/lib/i18n/server";
import {
  btnPrimary,
  btnSecondary,
  cardHover,
  cardPad,
  emptyBox,
  moduleAccents,
  PageTitle,
} from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import type { RecurrenceRule } from "@/modules/calendar/recurrence";
import {
  daysInMonth,
  formatMinutes,
  isoWeekday,
  occurrenceInMonth,
  todayInCopenhagen,
  toISODate,
  weekdayName,
} from "@/modules/calendar/recurrence";

type Occurrence = {
  date: string;
  event: {
    id: string;
    kind: "ADHOC" | "RECURRING";
    title: string;
    allDay: boolean;
    startMinutes: number | null;
    durationMinutes: number | null;
    location: string | null;
  };
};

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

  const dim = daysInMonth(year, month);
  const monthStart = toISODate(year, month, 1);
  const monthEnd = toISODate(year, month, dim);

  const [adhocEvents, recurringEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { kind: "ADHOC", date: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.calendarEvent.findMany({ where: { kind: "RECURRING" } }),
  ]);

  const occurrences: Occurrence[] = adhocEvents.map((e) => ({
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

  const byDay = new Map<number, Occurrence[]>();
  for (const occ of occurrences) {
    const day = Number(occ.date.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), occ]);
  }

  const prev = month === 1 ? monthParam(year - 1, 12) : monthParam(year, month - 1);
  const next = month === 12 ? monthParam(year + 1, 1) : monthParam(year, month + 1);
  const monthLabel = new Intl.DateTimeFormat(
    locale === "da" ? "da-DK" : "en-GB",
    { month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(Date.UTC(year, month - 1, 1)));

  const leadingBlanks = isoWeekday(year, month, 1) - 1;
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const accent = moduleAccents.calendar;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle>{t.modules.calendar.label}</PageTitle>
        <Link href="/calendar/new" className={btnPrimary}>
          <PlusIcon className="h-4 w-4" />
          {t.calendar.newEvent}
        </Link>
      </div>

      <section className={`${cardPad} mb-6`}>
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

        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={`h${i}`}
              className="pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500"
            >
              {weekdayName(i + 1, locale).slice(0, locale === "da" ? 3 : 3)}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`b${i}`} />;
            const iso = toISODate(year, month, day);
            const dayOccs = byDay.get(day) ?? [];
            const isToday = iso === today;
            return (
              <div
                key={iso}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm sm:aspect-auto sm:py-2 ${
                  isToday
                    ? "bg-white/10 font-semibold text-white ring-1 ring-lime-300/60"
                    : "text-zinc-300"
                }`}
              >
                <span>{day}</span>
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {dayOccs.slice(0, 3).map((occ, j) => (
                    <span
                      key={j}
                      className={`h-1.5 w-1.5 rounded-full ${
                        occ.event.kind === "RECURRING"
                          ? "bg-lime-300"
                          : "bg-amber-300"
                      }`}
                    />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {occurrences.length === 0 ? (
        <p className={emptyBox}>{t.calendar.empty}</p>
      ) : (
        <ul className="grid gap-3">
          {occurrences.map((occ) => {
            const day = Number(occ.date.slice(8, 10));
            const time = occ.event.allDay
              ? t.calendar.allDay
              : occ.event.startMinutes !== null
                ? formatMinutes(occ.event.startMinutes) +
                  (occ.event.durationMinutes
                    ? `–${formatMinutes(
                        occ.event.startMinutes + occ.event.durationMinutes,
                      )}`
                    : "")
                : "";
            return (
              <li key={`${occ.event.id}-${occ.date}`}>
                <Link
                  href={
                    occ.event.kind === "RECURRING"
                      ? `/calendar/${occ.event.id}?d=${occ.date}`
                      : `/calendar/${occ.event.id}`
                  }
                  className={`${cardHover} flex items-center gap-4 p-4`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br ${accent.gradient} text-white shadow-lg`}
                  >
                    <span className="text-lg font-bold leading-none">
                      {day}
                    </span>
                    <span className="text-[10px] uppercase leading-tight">
                      {weekdayName(
                        isoWeekday(year, month, day),
                        locale,
                      ).slice(0, 3)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-zinc-100">
                      {occ.event.title}
                    </span>
                    <span className="block truncate text-sm text-zinc-500">
                      {time}
                      {occ.event.location ? ` · ${occ.event.location}` : ""}
                    </span>
                  </span>
                  {occ.event.kind === "RECURRING" && (
                    <span className="shrink-0 rounded-full bg-lime-400/10 px-2.5 py-1 text-[11px] font-medium text-lime-300">
                      {t.calendar.recurringBadge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
