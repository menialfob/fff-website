"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { btnSecondary, errorText, input, label, linkDanger } from "@/components/ui";
import { UploadIcon } from "@/components/icons";
import { formatSize } from "@/lib/format";
import { uploadContentAsset } from "@/modules/content/actions";
import type { FieldType } from "./event-fields-editor";

export type FieldDef = { id: string; label: string; type: FieldType };
export type FieldFile = { id: string; name: string; size: number };
export type FieldInitialValue = {
  text: string | null;
  personId: string | null;
  file: FieldFile | null;
};

type Member = { id: string; name: string };

/**
 * Per-field value inputs for one occurrence date, one row per field
 * definition. Emits `fv_text_<id>` / `fv_person_<id>` / `fv_file_<id>` inputs
 * read by saveOccurrenceContent. All fields are optional. Document uploads go
 * through uploadContentAsset (like ContentAndAttachments) and report activity
 * up so the form can hold its submit button.
 */
export function OccurrenceFieldsInputs({
  fields,
  members,
  initialValues,
  onUploadingChange,
}: {
  fields: FieldDef[];
  members: Member[];
  initialValues: Record<string, FieldInitialValue>;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const { t } = useI18n();
  const f = t.calendar.fields;
  // Track which document fields are mid-upload so the parent holds submit.
  const [, setUploadingIds] = useState<Set<string>>(new Set());

  const setUploading = (fieldId: string, active: boolean) => {
    setUploadingIds((prev) => {
      const next = new Set(prev);
      if (active) next.add(fieldId);
      else next.delete(fieldId);
      onUploadingChange?.(next.size > 0);
      return next;
    });
  };

  if (fields.length === 0) return null;

  return (
    <div>
      <span className={label}>{f.sectionTitle}</span>
      <div className="mt-2 grid gap-4">
        {fields.map((field) => {
          const value = initialValues[field.id];
          return (
            <div key={field.id}>
              <label
                className={label}
                htmlFor={`fv-${field.id}`}
              >
                {field.label}
              </label>
              <div className="mt-1.5">
                {field.type === "TEXT" && (
                  <input
                    id={`fv-${field.id}`}
                    type="text"
                    name={`fv_text_${field.id}`}
                    maxLength={500}
                    defaultValue={value?.text ?? ""}
                    className={input}
                  />
                )}
                {field.type === "PERSON" && (
                  <select
                    id={`fv-${field.id}`}
                    name={`fv_person_${field.id}`}
                    defaultValue={value?.personId ?? ""}
                    className={input}
                  >
                    <option value="">{f.personPlaceholder}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                {field.type === "DOCUMENT" && (
                  <DocumentFieldInput
                    fieldId={field.id}
                    initialFile={value?.file ?? null}
                    onUploadingChange={(active) => setUploading(field.id, active)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentFieldInput({
  fieldId,
  initialFile,
  onUploadingChange,
}: {
  fieldId: string;
  initialFile: FieldFile | null;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const { t } = useI18n();
  const f = t.calendar.fields;
  const [file, setFile] = useState<FieldFile | null>(initialFile);
  const [uploading, setUploadingState] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const setUploading = (value: boolean) => {
    setUploadingState(value);
    onUploadingChange(value);
  };

  const upload = async (picked: File) => {
    setError(undefined);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", picked);
      const result = await uploadContentAsset(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.ok && result.id) {
        setFile({
          id: result.id,
          name: result.name ?? picked.name,
          size: picked.size,
        });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {/* Empty = cleared; saveOccurrenceContent claims the file into the folder. */}
      <input type="hidden" name={`fv_file_${fieldId}`} value={file?.id ?? ""} />
      {file && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <a
            href={`/api/files/${file.id}`}
            className="truncate font-medium text-zinc-100 hover:text-sky-300 hover:underline"
          >
            {file.name}
          </a>
          <span className="shrink-0 text-zinc-500">{formatSize(file.size)}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            className={`${linkDanger} shrink-0`}
          >
            {f.documentClear}
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={btnSecondary}
      >
        <UploadIcon className="h-4 w-4" />
        {uploading
          ? t.content.uploading
          : file
            ? f.documentReplace
            : f.documentChoose}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void upload(picked);
          e.target.value = "";
        }}
      />
      {error && (
        <p className={`${errorText} mt-2`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
