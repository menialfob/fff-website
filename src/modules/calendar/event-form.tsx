"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  btnSecondary,
  chip,
  errorText,
  input,
  label,
} from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { formatSize } from "@/lib/format";
import { monthName, weekdayName } from "./recurrence";
import { EventContentEditor } from "./editor";
import { createEvent, updateEvent, uploadCalendarAsset } from "./actions";

type Freq = "MONTHLY_NTH_WEEKDAY" | "YEARLY_NTH_WEEKDAY" | "YEARLY_FIXED_DATE";

export type EventFormValues = {
  id: string;
  kind: "ADHOC" | "RECURRING";
  title: string;
  location: string | null;
  allDay: boolean;
  startMinutes: number | null;
  durationMinutes: number | null;
  date: string | null;
  freq: Freq | null;
  weekday: number | null;
  ordinal: number | null;
  month: number | null;
  dayOfMonth: number | null;
  contentJson: string | null;
};

type Attachment = { id: string; name: string; size: number };

function minutesToTime(minutes: number | null): string {
  if (minutes === null) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const ORDINALS = ["1", "2", "3", "4", "-1"] as const;

export function EventForm({
  event,
  canRecurring,
}: {
  /** Present when editing; absent when creating. */
  event?: EventFormValues;
  /** Whether the viewer may manage recurring events (ADMIN/BESTYRELSE). */
  canRecurring: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [kind, setKind] = useState<"ADHOC" | "RECURRING">(
    event?.kind ?? "ADHOC",
  );
  const [freq, setFreq] = useState<Freq>(event?.freq ?? "MONTHLY_NTH_WEEKDAY");
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const editable = kind !== "RECURRING" || canRecurring;

  const addAttachments = async (files: FileList) => {
    setError(undefined);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadCalendarAsset(formData);
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
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = event
            ? await updateEvent(event.id, formData)
            : await createEvent(formData);
          setError(result?.error);
          if (result?.ok && result.id) router.push(`/calendar/${result.id}`);
        })
      }
      className="grid gap-5"
    >
      <input type="hidden" name="kind" value={kind} />
      {attachments.map((a) => (
        <input key={a.id} type="hidden" name="attachmentIds" value={a.id} />
      ))}

      {!event && (
        <div>
          <span className={label}>{t.calendar.form.kindLabel}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              className={chip(kind === "ADHOC")}
              onClick={() => setKind("ADHOC")}
            >
              {t.calendar.adhocBadge}
            </button>
            <button
              type="button"
              className={chip(kind === "RECURRING")}
              onClick={() => canRecurring && setKind("RECURRING")}
              disabled={!canRecurring}
            >
              {t.calendar.recurringBadge}
            </button>
          </div>
          {!canRecurring && (
            <p className="mt-1.5 text-xs text-zinc-500">
              {t.calendar.form.recurringHint}
            </p>
          )}
        </div>
      )}

      <div>
        <label className={label} htmlFor="event-title">
          {t.calendar.form.titleLabel}
        </label>
        <input
          id="event-title"
          type="text"
          name="title"
          required
          maxLength={120}
          defaultValue={event?.title ?? ""}
          className={`${input} mt-1.5`}
        />
      </div>

      <div>
        <label className={label} htmlFor="event-location">
          {t.calendar.form.locationLabel}
        </label>
        <input
          id="event-location"
          type="text"
          name="location"
          maxLength={120}
          defaultValue={event?.location ?? ""}
          className={`${input} mt-1.5`}
        />
      </div>

      {kind === "ADHOC" ? (
        <div>
          <label className={label} htmlFor="event-date">
            {t.calendar.form.dateLabel}
          </label>
          <input
            id="event-date"
            type="date"
            name="date"
            required
            defaultValue={event?.date ?? ""}
            className={`${input} mt-1.5`}
          />
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <span className={label}>{t.calendar.form.patternLabel}</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  ["MONTHLY_NTH_WEEKDAY", t.calendar.form.freqMonthly],
                  ["YEARLY_NTH_WEEKDAY", t.calendar.form.freqYearlyNth],
                  ["YEARLY_FIXED_DATE", t.calendar.form.freqFixed],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  className={chip(freq === value)}
                  onClick={() => setFreq(value)}
                >
                  {text}
                </button>
              ))}
            </div>
            <input type="hidden" name="freq" value={freq} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {freq !== "YEARLY_FIXED_DATE" && (
              <>
                <div>
                  <label className={label} htmlFor="event-ordinal">
                    {t.calendar.form.ordinalLabel}
                  </label>
                  <select
                    id="event-ordinal"
                    name="ordinal"
                    defaultValue={String(event?.ordinal ?? 1)}
                    className={`${input} mt-1.5`}
                  >
                    {ORDINALS.map((o) => (
                      <option key={o} value={o}>
                        {t.calendar.recurrence.ordinals[o]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="event-weekday">
                    {t.calendar.form.weekdayLabel}
                  </label>
                  <select
                    id="event-weekday"
                    name="weekday"
                    defaultValue={String(event?.weekday ?? 5)}
                    className={`${input} mt-1.5`}
                  >
                    {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d} className="capitalize">
                        {weekdayName(d, locale)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {freq !== "MONTHLY_NTH_WEEKDAY" && (
              <div>
                <label className={label} htmlFor="event-month">
                  {t.calendar.form.monthLabel}
                </label>
                <select
                  id="event-month"
                  name="month"
                  defaultValue={String(event?.month ?? 1)}
                  className={`${input} mt-1.5`}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m} className="capitalize">
                      {monthName(m, locale)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {freq === "YEARLY_FIXED_DATE" && (
              <div>
                <label className={label} htmlFor="event-dom">
                  {t.calendar.form.dayOfMonthLabel}
                </label>
                <input
                  id="event-dom"
                  type="number"
                  name="dayOfMonth"
                  min={1}
                  max={31}
                  required
                  defaultValue={event?.dayOfMonth ?? 1}
                  className={`${input} mt-1.5`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <input
            type="checkbox"
            name="allDay"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5"
          />
          {t.calendar.form.allDayLabel}
        </label>
        {!allDay && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="event-start">
                {t.calendar.form.startLabel}
              </label>
              <input
                id="event-start"
                type="time"
                name="startTime"
                required
                defaultValue={minutesToTime(event?.startMinutes ?? null)}
                className={`${input} mt-1.5`}
              />
            </div>
            <div>
              <label className={label} htmlFor="event-end">
                {t.calendar.form.endLabel}
              </label>
              <input
                id="event-end"
                type="time"
                name="endTime"
                defaultValue={
                  event && event.startMinutes !== null && event.durationMinutes
                    ? minutesToTime(event.startMinutes + event.durationMinutes)
                    : ""
                }
                className={`${input} mt-1.5`}
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <span className={label}>{t.calendar.form.contentLabel}</span>
        <div className="mt-1.5">
          <EventContentEditor initialContent={event?.contentJson ?? null} />
        </div>
      </div>

      <div>
        <span className={label}>{t.calendar.form.attachmentsLabel}</span>
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
          {uploading ? t.files.uploading : t.calendar.form.addAttachment}
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
      </div>

      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || uploading || !editable}
          className={btnPrimary}
        >
          {isPending
            ? t.common.saving
            : event
              ? t.common.save
              : t.calendar.form.create}
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
