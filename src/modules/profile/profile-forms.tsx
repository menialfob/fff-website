"use client";

import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, errorText, input, label, okText } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { changePassword, removeAvatar, updateAvatar, updateProfile } from "./actions";

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

export function AvatarForm({
  userId,
  userName,
  avatarUrl,
}: {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState<ActionResult>();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(file: File | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.set("avatar", file);
    startTransition(async () => {
      setResult(await updateAvatar(formData));
      // Allow re-selecting the same file after an error.
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar id={userId} name={userName} avatarUrl={avatarUrl} size="lg" />
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => fileRef.current?.click()}
            className={btnPrimary}
          >
            {isPending ? t.common.saving : t.profile.avatarChange}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => setResult(await removeAvatar()))
              }
              className={btnSecondary}
            >
              {t.profile.avatarRemove}
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{t.profile.avatarHint}</p>
      <StatusMessage result={result} />
    </div>
  );
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
