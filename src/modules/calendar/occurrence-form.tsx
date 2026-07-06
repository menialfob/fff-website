"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, btnSecondary, errorText } from "@/components/ui";
import { ContentAndAttachments } from "@/modules/content/content-fields";
import {
  OccurrenceFieldsInputs,
  type FieldDef,
  type FieldInitialValue,
} from "./occurrence-fields-inputs";
import { saveOccurrenceContent } from "./actions";

type Member = { id: string; name: string };

/** Edits the structured fields, description + attachments of one occurrence. */
export function OccurrenceContentForm({
  eventId,
  date,
  initialContent,
  fields,
  members,
  initialValues,
}: {
  eventId: string;
  date: string;
  initialContent: string | null;
  fields: FieldDef[];
  members: Member[];
  initialValues: Record<string, FieldInitialValue>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [contentUploading, setContentUploading] = useState(false);
  const [fieldsUploading, setFieldsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const uploading = contentUploading || fieldsUploading;

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
      <OccurrenceFieldsInputs
        fields={fields}
        members={members}
        initialValues={initialValues}
        onUploadingChange={setFieldsUploading}
      />
      <ContentAndAttachments
        initialContent={initialContent}
        onUploadingChange={setContentUploading}
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
