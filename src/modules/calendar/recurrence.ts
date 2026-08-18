import { fmt, type Locale } from "@/lib/i18n";

/**
 * Occurrence math for the three supported recurrence patterns. Everything
 * works on "YYYY-MM-DD" strings and plain integers — never on Date objects
 * carrying the server's timezone — so results are Danish calendar dates by
 * construction. Date.UTC is used only to derive weekdays, which is
 * timezone-free.
 */

export type RecurrenceRule = {
  freq: "MONTHLY_NTH_WEEKDAY" | "YEARLY_NTH_WEEKDAY" | "YEARLY_FIXED_DATE";
  /** ISO weekday 1 = Monday … 7 = Sunday (nth-weekday patterns). */
  weekday?: number | null;
  /** 1..4, or -1 for the last weekday of the month (nth-weekday patterns). */
  ordinal?: number | null;
  /** 1..12 (yearly patterns). */
  month?: number | null;
  /** 1..31 (YEARLY_FIXED_DATE). */
  dayOfMonth?: number | null;
};

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month; UTC keeps this independent of the server TZ.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(year: number, month: number, day: number): number {
  const sundayZero = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return sundayZero === 0 ? 7 : sundayZero;
}

export function toISODate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function parseISODate(
  iso: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Day of month of the nth `weekday` (ordinal 1..4, or -1 for the last one).
 * Every month has at least four of each weekday, so this never misses.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: number,
): number {
  if (ordinal === -1) {
    const last = daysInMonth(year, month);
    const back = (isoWeekday(year, month, last) - weekday + 7) % 7;
    return last - back;
  }
  const forward = (weekday - isoWeekday(year, month, 1) + 7) % 7;
  return 1 + forward + (ordinal - 1) * 7;
}

/** The rule's occurrence date within one month, or null if none. */
export function occurrenceInMonth(
  rule: RecurrenceRule,
  year: number,
  month: number,
): string | null {
  switch (rule.freq) {
    case "MONTHLY_NTH_WEEKDAY":
      if (!rule.weekday || !rule.ordinal) return null;
      return toISODate(
        year,
        month,
        nthWeekdayOfMonth(year, month, rule.weekday, rule.ordinal),
      );
    case "YEARLY_NTH_WEEKDAY":
      if (!rule.weekday || !rule.ordinal || rule.month !== month) return null;
      return toISODate(
        year,
        month,
        nthWeekdayOfMonth(year, month, rule.weekday, rule.ordinal),
      );
    case "YEARLY_FIXED_DATE":
      if (!rule.month || !rule.dayOfMonth || rule.month !== month) return null;
      // Feb 29 is rejected at creation; guard anyway for short months.
      if (rule.dayOfMonth > daysInMonth(year, month)) return null;
      return toISODate(year, month, rule.dayOfMonth);
  }
}

/** "YYYY-MM-DD" + n days → "YYYY-MM-DD" (UTC math, timezone-free). */
export function addDays(iso: string, days: number): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return d.toISOString().slice(0, 10);
}

/** Whether a "YYYY-MM-DD" date is an occurrence of the rule. */
export function isOccurrenceDate(rule: RecurrenceRule, iso: string): boolean {
  const parsed = parseISODate(iso);
  if (!parsed) return false;
  return occurrenceInMonth(rule, parsed.year, parsed.month) === iso;
}

/** All occurrence dates with fromISO <= date <= toISO, ascending. */
export function occurrencesInRange(
  rule: RecurrenceRule,
  fromISO: string,
  toISO: string,
): string[] {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  if (!from || !to || fromISO > toISO) return [];

  const result: string[] = [];
  let year = from.year;
  let month = from.month;
  while (year < to.year || (year === to.year && month <= to.month)) {
    const date = occurrenceInMonth(rule, year, month);
    if (date && date >= fromISO && date <= toISO) result.push(date);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

/** The next `count` occurrences on or after fromISO. */
export function nextOccurrences(
  rule: RecurrenceRule,
  fromISO: string,
  count: number,
): string[] {
  const from = parseISODate(fromISO);
  if (!from || count < 1) return [];

  const result: string[] = [];
  let year = from.year;
  let month = from.month;
  // Yearly rules need at most `count` years of look-ahead; cap generously.
  const maxMonths = (count + 1) * 12;
  for (let i = 0; i < maxMonths && result.length < count; i++) {
    const date = occurrenceInMonth(rule, year, month);
    if (date && date >= fromISO) result.push(date);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

/** Danish/English weekday name (lowercase, as used mid-sentence). */
export function weekdayName(weekday: number, locale: Locale): string {
  // 2024-01-01 was a Monday; offset from it to get any ISO weekday.
  const date = new Date(Date.UTC(2024, 0, 1 + (weekday - 1)));
  return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

/** Danish/English month name (lowercase in Danish, as used mid-sentence). */
export function monthName(month: number, locale: Locale): string {
  const date = new Date(Date.UTC(2024, month - 1, 1));
  return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/** Dictionary slice needed to describe a rule (see t.calendar.recurrence). */
export type RecurrenceDict = {
  ordinals: Record<"1" | "2" | "3" | "4" | "-1", string>;
  everyMonth: string;
  inMonth: string;
  fixedDate: string;
};

/** Human-readable rule, e.g. "Første fredag i marts". */
export function describeRule(
  rule: RecurrenceRule,
  locale: Locale,
  dict: RecurrenceDict,
): string {
  const ordinal =
    rule.ordinal != null
      ? dict.ordinals[String(rule.ordinal) as keyof RecurrenceDict["ordinals"]]
      : "";
  switch (rule.freq) {
    case "MONTHLY_NTH_WEEKDAY":
      return fmt(dict.everyMonth, {
        ordinal,
        weekday: weekdayName(rule.weekday ?? 1, locale),
      });
    case "YEARLY_NTH_WEEKDAY":
      return fmt(dict.inMonth, {
        ordinal,
        weekday: weekdayName(rule.weekday ?? 1, locale),
        month: monthName(rule.month ?? 1, locale),
      });
    case "YEARLY_FIXED_DATE":
      return fmt(dict.fixedDate, {
        day: String(rule.dayOfMonth ?? 1),
        month: monthName(rule.month ?? 1, locale),
      });
  }
}

/** Today's date in Copenhagen as "YYYY-MM-DD", independent of server TZ. */
export function todayInCopenhagen(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Localized rendering of a "YYYY-MM-DD" string. The date is interpreted as
 * UTC so the server's timezone can never shift it to a neighbouring day.
 */
export function formatISODate(
  iso: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  },
): string {
  return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** "HH:MM" from minutes since midnight. */
export function formatMinutes(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Name of the attachment folder holding one occurrence's assets, e.g.
 * "Småevent Juni 2025" — the way members refer to the instance itself, rather
 * than the ISO date the occurrence is keyed by. All three recurrence patterns
 * yield at most one occurrence per month, so month + year still identifies it
 * uniquely within a series. Always Danish: the name is stored in the database
 * once, not re-rendered per reader's locale.
 */
export function occurrenceFolderName(title: string, iso: string): string {
  const parsed = parseISODate(iso);
  if (!parsed) return `${title} ${iso}`;
  const month = monthName(parsed.month, "da");
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${title} ${capitalized} ${parsed.year}`;
}
