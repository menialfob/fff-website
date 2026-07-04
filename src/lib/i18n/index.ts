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

export function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === "da" ? "da-DK" : "en-GB");
}
