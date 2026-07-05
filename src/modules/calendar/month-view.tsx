"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  cardHover,
  cardPad,
  emptyBox,
  moduleAccents,
} from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import {
  formatISODate,
  formatMinutes,
  isoWeekday,
  toISODate,
  weekdayName,
} from "./recurrence";

export type MonthOccurrence = {
  date: string;
  /** Last covered day for multi-day events, null for single-day. */
  endDate: string | null;
  event: {
    id: string;
    kind: "ADHOC" | "RECURRING";
    title: string;
    allDay: boolean;
    startMinutes: number | null;
    endMinutes: number | null;
    location: string | null;
  };
};

/** Whether an occurrence covers the given day. */
function covers(occ: MonthOccurrence, iso: string): boolean {
  return occ.date <= iso && iso <= (occ.endDate ?? occ.date);
}

function OccurrenceCard({
  occ,
  weekdayLabel,
}: {
  occ: MonthOccurrence;
  weekdayLabel: string;
}) {
  const { t } = useI18n();
  const accent = moduleAccents.calendar;
  const day = Number(occ.date.slice(8, 10));
  const multiDay = occ.endDate !== null && occ.endDate > occ.date;
  let time = occ.event.allDay
    ? t.calendar.allDay
    : occ.event.startMinutes !== null
      ? formatMinutes(occ.event.startMinutes) +
        (occ.event.endMinutes !== null
          ? `–${formatMinutes(occ.event.endMinutes)}`
          : "")
      : "";
  if (multiDay) {
    // e.g. "17.–19." prefix so the span is visible in the list.
    time = `${day}.–${Number(occ.endDate!.slice(8, 10))}. · ${time}`;
  }
  return (
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
        <span className="text-lg font-bold leading-none">{day}</span>
        <span className="text-[10px] uppercase leading-tight">
          {weekdayLabel}
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
  );
}

/**
 * Interactive month grid + event list. Tapping a day selects it (tap again
 * to deselect): the cell highlights, the list narrows to that date, and the
 * "new event" link pre-fills the date for ad hoc events.
 */
export function MonthView({
  year,
  month,
  today,
  occurrences,
  header,
}: {
  year: number;
  month: number;
  /** Copenhagen "YYYY-MM-DD". */
  today: string;
  occurrences: MonthOccurrence[];
  /** Month label + prev/next links, rendered server-side. */
  header: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);

  const daysInThisMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = isoWeekday(year, month, 1) - 1;
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInThisMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Multi-day occurrences put a dot on every covered day of this month.
  const byDay = new Map<number, MonthOccurrence[]>();
  for (let day = 1; day <= daysInThisMonth; day++) {
    const iso = toISODate(year, month, day);
    const dayOccs = occurrences.filter((occ) => covers(occ, iso));
    if (dayOccs.length > 0) byDay.set(day, dayOccs);
  }

  const shown = selected
    ? occurrences.filter((occ) => covers(occ, selected))
    : occurrences;
  const newEventHref = selected
    ? `/calendar/new?date=${selected}`
    : "/calendar/new";

  const weekdayShort = (isoDay: number) =>
    weekdayName(isoDay, locale).slice(0, 3);

  return (
    <>
      <section className={`${cardPad} mb-6`}>
        {header}
        <div className="grid grid-cols-7 gap-1 text-center">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={`h${i}`}
            className="pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500"
          >
            {weekdayShort(i + 1)}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const iso = toISODate(year, month, day);
          const dayOccs = byDay.get(day) ?? [];
          const isToday = iso === today;
          const isSelected = iso === selected;
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(isSelected ? null : iso)}
              className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg text-sm transition sm:aspect-auto sm:py-2 ${
                isSelected
                  ? "bg-lime-400/20 font-semibold text-white ring-1 ring-lime-300"
                  : isToday
                    ? "bg-white/10 font-semibold text-white ring-1 ring-white/40 hover:bg-white/15"
                    : "text-zinc-300 hover:bg-white/5"
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
            </button>
          );
        })}
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white first-letter:uppercase">
          {selected ? formatISODate(selected, locale) : ""}
        </h3>
        <Link href={newEventHref} className={btnPrimary}>
          <PlusIcon className="h-4 w-4" />
          {t.calendar.newEvent}
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className={emptyBox}>
          {selected ? t.calendar.noEventsThisDay : t.calendar.empty}
        </p>
      ) : (
        <ul className="grid gap-3">
          {shown.map((occ) => (
            <li key={`${occ.event.id}-${occ.date}`}>
              <OccurrenceCard
                occ={occ}
                weekdayLabel={weekdayShort(
                  // From the occurrence's own date — it may have started in
                  // the previous month.
                  isoWeekday(
                    Number(occ.date.slice(0, 4)),
                    Number(occ.date.slice(5, 7)),
                    Number(occ.date.slice(8, 10)),
                  ),
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
