"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  btnSecondary,
  chip,
  errorText,
  input,
  label,
} from "@/components/ui";
import { ContentAndAttachments } from "@/modules/content/content-fields";
import {
  EventFieldsEditor,
  type EventFieldValue,
} from "./event-fields-editor";
import { monthName, weekdayName } from "./recurrence";
import { createEvent, updateEvent } from "./actions";

type Freq = "MONTHLY_NTH_WEEKDAY" | "YEARLY_NTH_WEEKDAY" | "YEARLY_FIXED_DATE";

export type EventFormValues = {
  id: string;
  kind: "ADHOC" | "RECURRING";
  title: string;
  location: string | null;
  allDay: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
  date: string | null;
  endDate: string | null;
  endDayOffset: number | null;
  freq: Freq | null;
  weekday: number | null;
  ordinal: number | null;
  month: number | null;
  dayOfMonth: number | null;
  contentJson: string | null;
  /** RECURRING only — the series' structured field definitions. */
  fields?: EventFieldValue[];
};

function minutesToTime(minutes: number | null): string {
  if (minutes === null) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

const ORDINALS = ["1", "2", "3", "4", "-1"] as const;

// iOS Safari gives date/time inputs a large intrinsic width the UA won't
// let shrink, so side-by-side fields overflowed their grid columns and
// clipped into each other. appearance-none drops the UA sizing entirely
// (the native picker still opens on tap); h-11 keeps the height stable
// when the field is empty.
const pickerInput = `${input} h-11 min-w-0 appearance-none px-3 [&::-webkit-calendar-picker-indicator]:ml-0.5 [&::-webkit-calendar-picker-indicator]:opacity-60`;
const timeInput = `${pickerInput} tabular-nums`;

export function EventForm({
  event,
  canRecurring,
  defaultDate,
}: {
  /** Present when editing; absent when creating. */
  event?: EventFormValues;
  /** Whether the viewer may manage recurring events (ADMIN/BESTYRELSE). */
  canRecurring: boolean;
  /** Pre-fills the ad hoc date field (day selected in the month view). */
  defaultDate?: string;
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
  const [uploading, setUploading] = useState(false);

  const editable = kind !== "RECURRING" || canRecurring;

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
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className={label} htmlFor="event-date">
              {t.calendar.form.dateLabel}
            </label>
            <input
              id="event-date"
              type="date"
              name="date"
              required
              defaultValue={event?.date ?? defaultDate ?? ""}
              className={`${pickerInput} mt-1.5`}
            />
          </div>
          <div className="min-w-0">
            <label className={label} htmlFor="event-end-date">
              {t.calendar.form.endDateLabel}
            </label>
            <input
              id="event-end-date"
              type="date"
              name="endDate"
              defaultValue={event?.endDate ?? ""}
              className={`${pickerInput} mt-1.5`}
            />
          </div>
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
            <div>
              <label className={label} htmlFor="event-days">
                {t.calendar.form.daysLabel}
              </label>
              <input
                id="event-days"
                type="number"
                name="days"
                min={1}
                max={14}
                defaultValue={(event?.endDayOffset ?? 0) + 1}
                className={`${input} mt-1.5`}
              />
              <p className="mt-1 text-xs text-zinc-500">
                {t.calendar.form.daysHint}
              </p>
            </div>
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
          <div className="mt-3 grid max-w-xs grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className={label} htmlFor="event-start">
                {t.calendar.form.startLabel}
              </label>
              <input
                id="event-start"
                type="time"
                name="startTime"
                required
                defaultValue={minutesToTime(event?.startMinutes ?? null)}
                className={`${timeInput} mt-1.5`}
              />
            </div>
            <div className="min-w-0">
              <label className={label} htmlFor="event-end">
                {t.calendar.form.endLabel}
              </label>
              <input
                id="event-end"
                type="time"
                name="endTime"
                defaultValue={minutesToTime(event?.endMinutes ?? null)}
                className={`${timeInput} mt-1.5`}
              />
            </div>
          </div>
        )}
      </div>

      {kind === "ADHOC" ? (
        <ContentAndAttachments
          initialContent={event?.contentJson ?? null}
          onUploadingChange={setUploading}
        />
      ) : (
        <>
          <p className="text-sm text-zinc-500">{t.calendar.form.perDateHint}</p>
          <EventFieldsEditor initialFields={event?.fields} />
        </>
      )}

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
