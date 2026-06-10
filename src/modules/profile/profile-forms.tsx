"use client";

import { useState, useTransition } from "react";
import { changePassword, updateProfile } from "./actions";

type ActionResult = { error?: string; ok?: boolean } | undefined;

function StatusMessage({ result }: { result: ActionResult }) {
  if (!result) return null;
  if (result.error)
    return (
      <p className="text-sm text-red-600" role="alert">
        {result.error}
      </p>
    );
  return <p className="text-sm text-green-700">Saved.</p>;
}

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 shadow-sm focus:border-stone-500 focus:outline-none";
const buttonClass =
  "rounded-md bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700 disabled:opacity-50";

export function ProfileForm({
  defaultName,
  defaultBio,
}: {
  defaultName: string;
  defaultBio: string;
}) {
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
        <label htmlFor="name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={defaultName}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="bio" className="block text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          defaultValue={defaultBio}
          className={inputClass}
        />
      </div>
      <StatusMessage result={result} />
      <button type="submit" disabled={isPending} className={buttonClass}>
        {isPending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

export function PasswordForm() {
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
        <label htmlFor="currentPassword" className="block text-sm font-medium">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </div>
      <StatusMessage result={result} />
      <button type="submit" disabled={isPending} className={buttonClass}>
        {isPending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
