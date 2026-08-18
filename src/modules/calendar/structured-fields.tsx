import type { FieldType } from "./event-fields-editor";
import { FileFieldLink } from "./file-field-link";

type FieldDef = { id: string; label: string; type: FieldType };

type FieldValue = {
  fieldId: string;
  text: string | null;
  personId: string | null;
  person: { name: string } | null;
  file: { id: string; name: string } | null;
};

export type RenderField = {
  id: string;
  label: string;
  type: FieldType;
  personName?: string;
  text?: string;
  file?: { id: string; name: string };
};

/**
 * Join a series' field definitions with one occurrence's saved values into a
 * flat, render-ready list. Definitions drive the order; a field with no
 * (non-empty, non-deleted) value is dropped. Pure — no DB access — so the same
 * output feeds the event detail page and the forum thread header.
 */
export function toRenderFields(
  fields: FieldDef[],
  values: FieldValue[],
): RenderField[] {
  const byField = new Map(values.map((v) => [v.fieldId, v]));
  const rendered: RenderField[] = [];
  for (const field of fields) {
    const value = byField.get(field.id);
    if (!value) continue;
    if (field.type === "TEXT") {
      const text = value.text?.trim();
      if (text) rendered.push({ ...field, text });
    } else if (field.type === "PERSON") {
      // personId set but person null = deleted member → skip.
      if (value.personId && value.person) {
        rendered.push({ ...field, personName: value.person.name });
      }
    } else if (field.type === "DOCUMENT") {
      if (value.file) rendered.push({ ...field, file: value.file });
    }
  }
  return rendered;
}

/**
 * Renders the "Fields" section for an occurrence: one label → value row per
 * populated field (person name, text, or a document link that opens inline via
 * the authed /api/files route). Returns null when nothing is populated, so the
 * caller never shows an empty section.
 */
export function StructuredFields({ fields }: { fields: RenderField[] }) {
  if (fields.length === 0) return null;
  return (
    <dl className="grid gap-2 text-sm">
      {fields.map((field) => (
        <div key={field.id} className="flex flex-wrap gap-x-2">
          <dt className="font-medium text-zinc-400">{field.label}</dt>
          <dd className="text-zinc-100">
            {field.personName !== undefined && field.personName}
            {field.text !== undefined && field.text}
            {field.file !== undefined && (
              <FileFieldLink id={field.file.id} name={field.file.name} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
