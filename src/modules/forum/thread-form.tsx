"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, errorText, input, label } from "@/components/ui";
import { ContentAndAttachments } from "@/modules/content/content-fields";
import { createThread } from "./actions";

/** New-thread form: a title plus the shared rich-text + attachments body. */
export function ThreadForm({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createThread(categoryId, formData);
          setError(result?.error);
          if (result?.ok && result.id) router.push(`/forum/t/${result.id}`);
        })
      }
      className="grid gap-5"
    >
      <div>
        <label className={label} htmlFor="thread-title">
          {t.forum.titleLabel}
        </label>
        <input
          id="thread-title"
          type="text"
          name="title"
          required
          maxLength={140}
          className={`${input} mt-1.5`}
        />
      </div>

      <ContentAndAttachments
        initialContent={null}
        onUploadingChange={setUploading}
      />

      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || uploading}
          className={btnPrimary}
        >
          {isPending ? t.common.saving : t.forum.createThread}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className={btnSecondary}
        >
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
