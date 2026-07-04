"use client";

import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  errorText,
  input,
  label,
  linkDanger,
  okText,
} from "@/components/ui";
import { createUser, deleteUser } from "./actions";

export function CreateUserForm() {
  const { t } = useI18n();
  const [result, setResult] = useState<{ error?: string; ok?: boolean }>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          const res = await createUser(formData);
          setResult(res);
          if (res?.ok) formRef.current?.reset();
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className={label}>
            {t.admin.name}
          </label>
          <input id="new-name" name="name" required className={input} />
        </div>
        <div>
          <label htmlFor="new-email" className={label}>
            {t.admin.email}
          </label>
          <input
            id="new-email"
            name="email"
            type="email"
            required
            className={input}
          />
        </div>
        <div>
          <label htmlFor="new-password" className={label}>
            {t.admin.initialPassword}
          </label>
          <input
            id="new-password"
            name="password"
            type="text"
            required
            minLength={8}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="new-role" className={label}>
            {t.admin.role}
          </label>
          <select id="new-role" name="role" className={input}>
            <option value="MEMBER">{t.admin.roleMember}</option>
            <option value="ADMIN">{t.admin.roleAdmin}</option>
          </select>
        </div>
      </div>
      {result?.error && (
        <p className={errorText} role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && <p className={okText}>{t.admin.userCreated}</p>}
      <button type="submit" disabled={isPending} className={btnPrimary}>
        {isPending ? t.admin.creating : t.admin.createUser}
      </button>
    </form>
  );
}

export function DeleteUserButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const { t, fmt } = useI18n();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(fmt(t.admin.confirmDeleteUser, { name: userName })))
          return;
        startTransition(async () => {
          await deleteUser(userId);
        });
      }}
      className={linkDanger}
    >
      {t.common.delete}
    </button>
  );
}
