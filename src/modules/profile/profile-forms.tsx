"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, errorText, input, label, okText } from "@/components/ui";
import { changePassword, updateProfile } from "./actions";

type ActionResult = { error?: string; ok?: boolean } | undefined;

function StatusMessage({ result }: { result: ActionResult }) {
  const { t } = useI18n();
  if (!result) return null;
  if (result.error)
    return (
      <p className={errorText} role="alert">
        {result.error}
      </p>
    );
  return <p className={okText}>{t.common.saved}</p>;
}

export function ProfileForm({
  defaultName,
  defaultBio,
}: {
  defaultName: string;
  defaultBio: string;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState<ActionResult>();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => setResult(await updateProfile(formData)))
      }
      className="space-y-4"
    >
      <div>
        <label htmlFor="name" className={label}>
          {t.profile.name}
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={defaultName}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="bio" className={label}>
          {t.profile.bio}
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={defaultBio}
          className={input}
        />
      </div>
      <StatusMessage result={result} />
      <button type="submit" disabled={isPending} className={btnPrimary}>
        {isPending ? t.common.saving : t.profile.saveProfile}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const [result, setResult] = useState<ActionResult>();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => setResult(await changePassword(formData)))
      }
      className="space-y-4"
    >
      <div>
        <label htmlFor="currentPassword" className={label}>
          {t.profile.currentPassword}
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className={label}>
          {t.profile.newPassword}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={input}
        />
      </div>
      <StatusMessage result={result} />
      <button type="submit" disabled={isPending} className={btnPrimary}>
        {isPending ? t.common.saving : t.profile.changePassword}
      </button>
    </form>
  );
}
