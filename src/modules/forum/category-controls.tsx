"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  btnSecondary,
  errorText,
  input,
  label,
  linkDanger,
} from "@/components/ui";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  reorderCategory,
} from "./actions";

/** Admin: create a new forum category. */
export function CreateCategoryForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnSecondary}
      >
        {t.forum.newCategory}
      </button>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createCategory(formData);
          setError(result?.error);
          if (result?.ok) {
            setOpen(false);
            router.refresh();
          }
        })
      }
      className="grid gap-3"
    >
      <div>
        <label className={label} htmlFor="category-name">
          {t.forum.categoryNameLabel}
        </label>
        <input
          id="category-name"
          type="text"
          name="name"
          required
          maxLength={80}
          className={`${input} mt-1.5`}
        />
      </div>
      <div>
        <label className={label} htmlFor="category-desc">
          {t.forum.categoryDescLabel}
        </label>
        <input
          id="category-desc"
          type="text"
          name="description"
          maxLength={300}
          className={`${input} mt-1.5`}
        />
      </div>
      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? t.common.saving : t.common.create}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={btnSecondary}
        >
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}

/** Admin: rename / delete / reorder a single (non-events) category. */
export function CategoryAdminControls({
  categoryId,
  name,
  description,
}: {
  categoryId: string;
  name: string;
  description: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
      if (!result?.error) router.refresh();
    });

  if (editing) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await renameCategory(categoryId, formData);
            setError(result?.error);
            if (result?.ok) {
              setEditing(false);
              router.refresh();
            }
          })
        }
        className="mt-3 grid gap-3"
      >
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={name}
          className={input}
        />
        <input
          type="text"
          name="description"
          maxLength={300}
          defaultValue={description ?? ""}
          placeholder={t.forum.categoryDescLabel}
          className={input}
        />
        {error && (
          <p className={errorText} role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isPending} className={btnPrimary}>
            {isPending ? t.common.saving : t.common.save}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={btnSecondary}
          >
            {t.common.cancel}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => reorderCategory(categoryId, "up"))}
        className="text-zinc-400 hover:text-zinc-200"
      >
        {t.forum.moveUp}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => reorderCategory(categoryId, "down"))}
        className="text-zinc-400 hover:text-zinc-200"
      >
        {t.forum.moveDown}
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-zinc-400 hover:text-zinc-200"
      >
        {t.common.edit}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(t.forum.confirmDeleteCategory)) return;
          run(() => deleteCategory(categoryId));
        }}
        className={linkDanger}
      >
        {t.common.delete}
      </button>
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
