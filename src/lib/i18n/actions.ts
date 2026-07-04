"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from ".";

/**
 * Persist the interface language. Deliberately unauthenticated — the login
 * page offers the switcher too, and the cookie only affects presentation.
 */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
