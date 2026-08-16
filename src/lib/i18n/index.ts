/**
 * Lightweight i18n: two locales, typed dictionaries, cookie-based selection.
 * Danish is the default. No library — a nested string dictionary plus a
 * `fmt()` interpolator is all this site needs.
 */
import { da } from "./dictionaries/da";
import { en } from "./dictionaries/en";

export const locales = ["da", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "da";
export const LOCALE_COOKIE = "locale";

export type Dictionary = typeof da;

export const dictionaries: Record<Locale, Dictionary> = { da, en };

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}

/** Replace `{name}` placeholders: fmt("Hej {name}", { name: "Bo" }) → "Hej Bo". */
export function fmt(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  );
}

/** BCP-47 tag for `Intl` — our locale codes are language-only. */
export function intlLocale(locale: Locale): string {
  return locale === "da" ? "da-DK" : "en-GB";
}

/**
 * The club's wall clock. Timestamps are stored as UTC instants, so rendering
 * them without a timeZone would follow whatever the runtime is set to — the
 * server (UTC in Docker) and the phone in Denmark would disagree, and the
 * server-rendered markup would not match what the browser then renders.
 */
export const TIME_ZONE = "Europe/Copenhagen";

export function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(intlLocale(locale), { timeZone: TIME_ZONE });
}

export function formatDateTime(date: Date, locale: Locale): string {
  return date.toLocaleString(intlLocale(locale), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  });
}

/** Clock time alone, e.g. "14.05" (da) / "14:05" (en). */
export function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** The calendar day an instant falls on in Denmark, as "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Milliseconds until the club's clock rolls over into the next day — for
 * refreshing "I dag" in a view left open overnight. Measured against the
 * wall clock, so a DST night can be an hour out; callers reschedule anyway.
 */
export function msUntilNextDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = (part("hour") * 60 + part("minute")) * 60 + part("second");
  return (86_400 - elapsed) * 1000;
}

/** Whole calendar days between two instants (positive when `a` is later). */
function daysBetween(a: Date, b: Date): number {
  const ms =
    Date.parse(`${dayKey(a)}T00:00:00Z`) - Date.parse(`${dayKey(b)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Uppercase the first letter — Danish weekdays and months are lowercase. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Day heading for a message list, the way messaging apps write it: "I dag",
 * "I går", then the weekday for the rest of the past week ("Fredag"), then the
 * date itself ("3. april") — with the year once we're out of the current one.
 */
export function formatDayLabel(
  date: Date,
  locale: Locale,
  t: Dictionary,
  now: Date = new Date(),
): string {
  const age = daysBetween(now, date);
  if (age === 0) return t.common.today;
  if (age === 1) return t.common.yesterday;

  const sameYear = dayKey(date).slice(0, 4) === dayKey(now).slice(0, 4);
  const options: Intl.DateTimeFormatOptions =
    age > 1 && age < 7
      ? { weekday: "long" }
      : {
          day: "numeric",
          month: "long",
          ...(sameYear ? {} : { year: "numeric" }),
        };
  return capitalize(
    new Intl.DateTimeFormat(intlLocale(locale), {
      ...options,
      timeZone: TIME_ZONE,
    }).format(date),
  );
}
