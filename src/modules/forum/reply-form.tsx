"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, cardPad, errorText, label } from "@/components/ui";
import { ContentAndAttachments } from "@/modules/content/content-fields";
import { createReply } from "./actions";

/** Reply box anchored at the bottom of a thread. */
export function ReplyForm({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Bumping this remounts the editor to clear it after a successful reply.
  const [formKey, setFormKey] = useState(0);

  return (
    <form
      key={formKey}
      action={(formData) =>
        startTransition(async () => {
          const result = await createReply(threadId, formData);
          setError(result?.error);
          if (result?.ok) {
            setFormKey((k) => k + 1);
            router.refresh();
          }
        })
      }
      className={`${cardPad} grid gap-4`}
    >
      <span className={label}>{t.forum.replyLabel}</span>
      <ContentAndAttachments
        initialContent={null}
        onUploadingChange={setUploading}
      />
      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={isPending || uploading}
          className={btnPrimary}
        >
          {isPending ? t.common.saving : t.forum.postReply}
        </button>
      </div>
    </form>
  );
}
