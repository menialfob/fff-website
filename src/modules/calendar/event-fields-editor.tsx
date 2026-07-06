"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnSecondary,
  input,
  label,
  linkDanger,
} from "@/components/ui";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
} from "@/components/icons";

export type FieldType = "PERSON" | "TEXT" | "DOCUMENT";

export type EventFieldValue = {
  id: string;
  label: string;
  type: FieldType;
};

type Row = {
  /** Stable React key, client-only — distinct from the persisted `id`. */
  key: string;
  /** Present once the field exists in the database (locks its type). */
  id?: string;
  label: string;
  type: FieldType;
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Series-level editor for a recurring event's structured field definitions.
 * Renders a movable list of {label, type} rows and serialises the whole set
 * into a single hidden `fieldsJson` input read by createEvent/updateEvent.
 * A field's type is fixed once it has been saved (has an `id`).
 */
export function EventFieldsEditor({
  initialFields,
}: {
  initialFields?: EventFieldValue[];
}) {
  const { t } = useI18n();
  const f = t.calendar.fields;
  const [rows, setRows] = useState<Row[]>(
    () =>
      initialFields?.map((field) => ({
        key: newKey(),
        id: field.id,
        label: field.label,
        type: field.type,
      })) ?? [],
  );

  const update = (next: Row[]) => setRows(next);

  const addRow = () =>
    update([...rows, { key: newKey(), label: "", type: "TEXT" }]);

  const removeRow = (key: string) =>
    update(rows.filter((r) => r.key !== key));

  const patchRow = (key: string, patch: Partial<Row>) =>
    update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  // Serialised payload: id (when persisted), label, type — position is the
  // array index, resolved server-side.
  const fieldsJson = JSON.stringify(
    rows.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      label: r.label,
      type: r.type,
    })),
  );

  const types: FieldType[] = ["PERSON", "TEXT", "DOCUMENT"];
  const typeText: Record<FieldType, string> = {
    PERSON: f.typePerson,
    TEXT: f.typeText,
    DOCUMENT: f.typeDocument,
  };

  return (
    <div>
      <span className={label}>{f.sectionTitle}</span>
      <p className="mt-1 text-xs text-zinc-500">{f.editHint}</p>

      <input type="hidden" name="fieldsJson" value={fieldsJson} />

      {rows.length > 0 && (
        <ul className="mt-3 grid gap-3">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`field-label-${row.key}`}>
                    {f.labelLabel}
                  </label>
                  <input
                    id={`field-label-${row.key}`}
                    type="text"
                    value={row.label}
                    maxLength={80}
                    placeholder={f.labelPlaceholder}
                    onChange={(e) => patchRow(row.key, { label: e.target.value })}
                    className={input}
                  />
                </div>
                <div className="w-full sm:w-40">
                  <label className="sr-only" htmlFor={`field-type-${row.key}`}>
                    {f.typeLabel}
                  </label>
                  <select
                    id={`field-type-${row.key}`}
                    value={row.type}
                    disabled={Boolean(row.id)}
                    onChange={(e) =>
                      patchRow(row.key, { type: e.target.value as FieldType })
                    }
                    className={`${input} disabled:opacity-60`}
                  >
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {typeText[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={f.moveUp}
                  className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                >
                  <ChevronUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label={f.moveDown}
                  className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
                {row.id && (
                  <span className="text-xs text-zinc-600">
                    {f.typeLockedHint}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className={`${linkDanger} ml-auto`}
                >
                  {t.common.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addRow}
        className={`${btnSecondary} mt-3`}
      >
        <PlusIcon className="h-4 w-4" />
        {f.addField}
      </button>
      <p className="mt-2 text-xs text-zinc-500">{f.deleteWarning}</p>
    </div>
  );
}
