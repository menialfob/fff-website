"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  btnSecondary,
  errorText,
  input,
  linkDanger,
} from "@/components/ui";
import { PencilIcon, PlusIcon, UploadIcon } from "@/components/icons";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  renameFolder,
  uploadFile,
} from "./actions";

export function UploadForm({ folderId }: { folderId?: string }) {
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
      {folderId && (
        <input type="hidden" name="folderId" value={folderId} />
      )}
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

export function CreateFolderForm() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnSecondary}
      >
        <PlusIcon className="h-4 w-4" />
        {t.files.newFolder}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          const result = await createFolder(formData);
          setError(result?.error);
          if (result?.ok) {
            formRef.current?.reset();
            setOpen(false);
          }
        })
      }
      className="flex w-full flex-wrap items-center gap-2"
    >
      <input
        type="text"
        name="name"
        required
        maxLength={100}
        autoFocus
        placeholder={t.files.folderNamePlaceholder}
        className={`${input} max-w-xs`}
      />
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
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function FolderControls({
  folderId,
  name,
}: {
  folderId: string;
  name: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  if (renaming) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await renameFolder(folderId, formData);
            setError(result?.error);
            if (result?.ok) setRenaming(false);
          })
        }
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          name="name"
          required
          maxLength={100}
          autoFocus
          defaultValue={name}
          className={`${input} max-w-xs`}
        />
        <button type="submit" disabled={isPending} className={btnPrimary}>
          {isPending ? t.common.saving : t.common.save}
        </button>
        <button
          type="button"
          onClick={() => setRenaming(false)}
          className={btnSecondary}
        >
          {t.common.cancel}
        </button>
        {error && (
          <p className={`${errorText} w-full`} role="alert">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setRenaming(true)}
        className={btnSecondary}
      >
        <PencilIcon className="h-4 w-4" />
        {t.files.rename}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(t.files.confirmDeleteFolder)) return;
          startTransition(async () => {
            const result = await deleteFolder(folderId);
            setError(result?.error);
            if (result?.ok) router.push("/files");
          });
        }}
        className={linkDanger}
      >
        {t.files.deleteFolder}
      </button>
      {error && (
        <p className={`${errorText} w-full`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
