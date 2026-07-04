"use client";

import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatSize } from "@/lib/format";
import { extraRoles, type ExtraRole } from "@/lib/roles";
import {
  btnPrimary,
  btnSecondary,
  errorText,
  input,
  label,
  linkDanger,
  okText,
} from "@/components/ui";
import { ChevronDownIcon, KeyIcon } from "@/components/icons";
import {
  createUser,
  deleteUser,
  renameUser,
  resetUserPassword,
  setExtraRole,
  setUserActive,
  setUserAdmin,
} from "./actions";

type ActionResult = { error?: string; ok?: boolean } | undefined;

export function CreateUserForm() {
  const { t } = useI18n();
  const [result, setResult] = useState<ActionResult>();
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

const badgeBase =
  "rounded-full border px-2.5 py-0.5 text-xs font-medium";

export type UserRowData = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  extraRoles: ExtraRole[];
};

export type UserRowStats = {
  files: number;
  bytes: number;
  songs: number;
  cheers: number;
};

export function UserRow({
  user,
  stats,
  isSelf,
  lastLogin,
}: {
  user: UserRowData;
  stats: UserRowStats;
  isSelf: boolean;
  /** Pre-formatted date-time string, or null if the user never logged in. */
  lastLogin: string | null;
}) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const [renameResult, setRenameResult] = useState<ActionResult>();
  const [pwResult, setPwResult] = useState<ActionResult>();
  const [toggleError, setToggleError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const pwFormRef = useRef<HTMLFormElement>(null);

  const runToggle = (action: () => Promise<{ error?: string; ok?: boolean }>) =>
    startTransition(async () => {
      const res = await action();
      setToggleError(res?.error);
    });

  return (
    <li className={user.isActive ? "" : "opacity-60"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 text-left transition hover:bg-white/[0.04] sm:px-4"
      >
        <span className="font-medium text-zinc-100">{user.name}</span>
        {user.isAdmin && (
          <span className={`${badgeBase} border-rose-400/30 bg-rose-400/10 text-rose-300`}>
            {t.admin.adminBadge}
          </span>
        )}
        {user.extraRoles.map((role) => (
          <span
            key={role}
            className={`${badgeBase} border-sky-400/30 bg-sky-400/10 text-sky-300`}
          >
            {t.admin.roleNames[role]}
          </span>
        ))}
        {!user.isActive && (
          <span className={`${badgeBase} border-white/15 bg-white/[0.06] text-zinc-400`}>
            {t.admin.deactivatedBadge}
          </span>
        )}
        <span className="flex-1" />
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="w-full text-sm text-zinc-500">
          {user.email} ·{" "}
          {lastLogin
            ? fmt(t.admin.lastLogin, { date: lastLogin })
            : t.admin.neverLoggedIn}
        </span>
      </button>

      {open && (
        <div className="space-y-5 px-4 pb-5 pt-1 sm:px-6">
          <p className="text-sm text-zinc-500">
            {fmt(t.admin.statsFiles, {
              count: stats.files,
              size: formatSize(stats.bytes),
            })}
            {" · "}
            {fmt(t.admin.statsSongs, { count: stats.songs })}
            {" · "}
            {fmt(t.admin.statsCheers, { count: stats.cheers })}
          </p>

          <form
            action={(formData) =>
              startTransition(async () => {
                setRenameResult(await renameUser(user.id, formData));
              })
            }
            className="flex flex-wrap items-end gap-2"
          >
            <div className="min-w-48 flex-1">
              <label htmlFor={`name-${user.id}`} className={label}>
                {t.admin.newName}
              </label>
              <input
                id={`name-${user.id}`}
                name="name"
                defaultValue={user.name}
                required
                maxLength={100}
                className={input}
              />
            </div>
            <button type="submit" disabled={isPending} className={btnSecondary}>
              {t.common.save}
            </button>
            {renameResult?.error && (
              <p className={`${errorText} w-full`} role="alert">
                {renameResult.error}
              </p>
            )}
            {renameResult?.ok && (
              <p className={`${okText} w-full`}>{t.common.saved}</p>
            )}
          </form>

          <form
            ref={pwFormRef}
            action={(formData) =>
              startTransition(async () => {
                const res = await resetUserPassword(user.id, formData);
                setPwResult(res);
                if (res?.ok) pwFormRef.current?.reset();
              })
            }
            className="flex flex-wrap items-end gap-2"
          >
            <div className="min-w-48 flex-1">
              <label htmlFor={`pw-${user.id}`} className={label}>
                {t.admin.newTempPassword}
              </label>
              <input
                id={`pw-${user.id}`}
                name="password"
                type="text"
                required
                minLength={8}
                className={input}
              />
            </div>
            <button type="submit" disabled={isPending} className={btnSecondary}>
              <KeyIcon className="h-4 w-4" />
              {isPending ? t.admin.resetting : t.admin.resetPassword}
            </button>
            {pwResult?.error && (
              <p className={`${errorText} w-full`} role="alert">
                {pwResult.error}
              </p>
            )}
            {pwResult?.ok && (
              <p className={`${okText} w-full`}>{t.admin.passwordWasReset}</p>
            )}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {!isSelf && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => runToggle(() => setUserAdmin(user.id, !user.isAdmin))}
                className={btnSecondary}
              >
                {user.isAdmin ? t.admin.removeAdmin : t.admin.makeAdmin}
              </button>
            )}
            {extraRoles.map((role) => {
              const has = user.extraRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  disabled={isPending}
                  onClick={() => runToggle(() => setExtraRole(user.id, role, !has))}
                  className={btnSecondary}
                >
                  {fmt(has ? t.admin.revokeRole : t.admin.grantRole, {
                    role: t.admin.roleNames[role],
                  })}
                </button>
              );
            })}
            {!isSelf &&
              (user.isActive ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (!confirm(fmt(t.admin.confirmDeactivate, { name: user.name })))
                      return;
                    runToggle(() => setUserActive(user.id, false));
                  }}
                  className={btnSecondary}
                >
                  {t.admin.deactivate}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runToggle(() => setUserActive(user.id, true))}
                  className={btnSecondary}
                >
                  {t.admin.reactivate}
                </button>
              ))}
            <span className="flex-1" />
            {!isSelf && (
              <DeleteUserButton userId={user.id} userName={user.name} />
            )}
          </div>
          {toggleError && (
            <p className={errorText} role="alert">
              {toggleError}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
