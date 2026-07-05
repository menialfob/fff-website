"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnSecondary, errorText, label } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { formatSize } from "@/lib/format";
import { ContentEditor } from "./editor";
import { uploadContentAsset } from "./actions";

type Attachment = { id: string; name: string; size: number };

/**
 * Rich content editor + attachment uploader, shared by the calendar event
 * form, the per-date occurrence form and the forum post/reply forms. Emits
 * `contentJson` (hidden input from the editor) and repeated `attachmentIds`
 * fields into the enclosing form; reports upload activity so the parent can
 * hold its submit button.
 */
export function ContentAndAttachments({
  initialContent,
  onUploadingChange,
}: {
  initialContent: string | null;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploadingState] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const setUploading = (value: boolean) => {
    setUploadingState(value);
    onUploadingChange?.(value);
  };

  const addAttachments = async (files: FileList) => {
    setError(undefined);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadContentAsset(formData);
        if (result.error) {
          setError(result.error);
          break;
        }
        if (result.ok && result.id) {
          setAttachments((prev) => [
            ...prev,
            { id: result.id, name: result.name ?? file.name, size: file.size },
          ]);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {attachments.map((a) => (
        <input key={a.id} type="hidden" name="attachmentIds" value={a.id} />
      ))}
      <div>
        <span className={label}>{t.content.contentLabel}</span>
        <div className="mt-1.5">
          <ContentEditor initialContent={initialContent} />
        </div>
      </div>
      <div>
        <span className={label}>{t.content.attachmentsLabel}</span>
        {attachments.length > 0 && (
          <ul className="mt-2 grid gap-1 text-sm">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="truncate text-zinc-100">{a.name}</span>
                <span className="shrink-0 text-zinc-500">
                  {formatSize(a.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={() => attachmentInputRef.current?.click()}
          className={`${btnSecondary} mt-2`}
        >
          <PlusIcon className="h-4 w-4" />
          {uploading ? t.content.uploading : t.content.addAttachment}
        </button>
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void addAttachments(files);
            e.target.value = "";
          }}
        />
        {error && (
          <p className={`${errorText} mt-2`} role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
