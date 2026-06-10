"use client";

import { useRef, useState, useTransition } from "react";
import { deleteFile, uploadFile } from "./actions";

export function UploadForm() {
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
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:font-medium hover:file:bg-stone-300"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
      {error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function DeleteFileButton({ fileId }: { fileId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this file?")) return;
        startTransition(async () => {
          await deleteFile(fileId);
        });
      }}
      className="text-sm text-red-600 hover:underline disabled:opacity-50"
    >
      Delete
    </button>
  );
}
