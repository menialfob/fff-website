"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { errorText, linkDanger } from "@/components/ui";
import { deletePost } from "./actions";

/** Per-post edit link + delete button (author or admin). */
export function PostControls({
  postId,
  threadId,
}: {
  postId: string;
  threadId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/forum/t/${threadId}/${postId}/edit`}
        className="text-sm text-zinc-400 hover:text-zinc-200 hover:underline"
      >
        {t.common.edit}
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(t.forum.confirmDeletePost)) return;
          startTransition(async () => {
            const result = await deletePost(postId);
            setError(result?.error);
            if (result?.ok) {
              if (result.redirect) router.push(result.redirect);
              else router.refresh();
            }
          });
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
