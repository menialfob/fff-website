"use client";

import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, errorText, input, label } from "@/components/ui";
import { authenticate } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useI18n();
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label htmlFor="email" className={label}>
          {t.login.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={input}
        />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          {t.login.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </div>
      {errorMessage && (
        <p className={errorText} role="alert">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className={`${btnPrimary} w-full`}
      >
        {isPending ? t.login.signingIn : t.login.signIn}
      </button>
    </form>
  );
}
