"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnSecondary, errorText, linkDanger } from "@/components/ui";
import { deleteThread, setThreadLocked, setThreadPinned } from "./actions";

/**
 * Thread moderation: pin/lock toggles for admins, delete for the thread author
 * or an admin.
 */
export function ThreadControls({
  threadId,
  pinned,
  locked,
  canModerate,
  canDelete,
}: {
  threadId: string;
  pinned: boolean;
  locked: boolean;
  canModerate: boolean;
  canDelete: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string; redirect?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
      if (!result?.error) {
        if (result?.redirect) router.push(result.redirect);
        else router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      {canModerate && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => setThreadPinned(threadId, !pinned))}
            className={btnSecondary}
          >
            {pinned ? t.forum.unpin : t.forum.pin}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => setThreadLocked(threadId, !locked))}
            className={btnSecondary}
          >
            {locked ? t.forum.unlock : t.forum.lock}
          </button>
        </>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!confirm(t.forum.confirmDeleteThread)) return;
            run(() => deleteThread(threadId));
          }}
          className={linkDanger}
        >
          {t.forum.deleteThread}
        </button>
      )}
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
