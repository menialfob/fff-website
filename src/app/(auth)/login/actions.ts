"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/callback-url";
import { getDict } from "@/lib/i18n/server";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      // Sanitised again here: the hidden field is client-controlled, and
      // without an explicit `redirectTo` NextAuth falls back to the Referer —
      // the login page itself — and drops the member on the dashboard.
      redirectTo: safeCallbackPath(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return (await getDict()).login.invalidCredentials;
    }
    throw error;
  }
}
