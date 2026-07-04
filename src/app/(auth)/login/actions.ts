"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      return (await getDict()).login.invalidCredentials;
    }
    throw error;
  }
}
