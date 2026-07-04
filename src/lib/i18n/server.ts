import { cookies } from "next/headers";
import {
  defaultLocale,
  dictionaries,
  isLocale,
  LOCALE_COOKIE,
  type Dictionary,
  type Locale,
} from ".";

/** The visitor's locale, from the cookie set by the language switcher. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** Dictionary for the current request — usable in pages and server actions. */
export async function getDict(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
