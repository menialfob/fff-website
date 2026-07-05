"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, errorText } from "@/components/ui";
import { ContentAndAttachments } from "./event-form";
import { saveOccurrenceContent } from "./actions";

/** Edits the description + attachments of one occurrence date. */
export function OccurrenceContentForm({
  eventId,
  date,
  initialContent,
}: {
  eventId: string;
  date: string;
  initialContent: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await saveOccurrenceContent(eventId, date, formData);
          setError(result?.error);
          if (result?.ok) router.push(`/calendar/${eventId}?d=${date}`);
        })
      }
      className="grid gap-5"
    >
      <ContentAndAttachments
        initialContent={initialContent}
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
          {isPending ? t.common.saving : t.common.save}
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
