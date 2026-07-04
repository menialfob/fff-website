"use client";

import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, errorText, linkDanger } from "@/components/ui";
import { UploadIcon } from "@/components/icons";
import { deleteFile, uploadFile } from "./actions";

export function UploadForm() {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          const result = await uploadFile(formData);
          setError(result?.error);
          if (result?.ok) formRef.current?.reset();
        })
      }
      className="flex flex-wrap items-center gap-3"
    >
      <input
        type="file"
        name="file"
        required
        className="text-sm text-zinc-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:font-medium file:text-zinc-100 hover:file:bg-white/15"
      />
      <button type="submit" disabled={isPending} className={btnPrimary}>
        <UploadIcon className="h-4 w-4" />
        {isPending ? t.files.uploading : t.files.upload}
      </button>
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function DeleteFileButton({ fileId }: { fileId: string }) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(t.files.confirmDelete)) return;
        startTransition(async () => {
          await deleteFile(fileId);
        });
      }}
      className={linkDanger}
    >
      {t.common.delete}
    </button>
  );
}
