"use server";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n";
import { claimAssets, parseContentFields } from "@/modules/content/assets";
import {
  createEventThread,
  ensureOccurrenceThread,
  renameEventThread,
  renameOccurrenceThreadsForEvent,
} from "@/modules/forum/events";
import {
  daysInMonth,
  isOccurrenceDate,
  parseISODate,
  type RecurrenceRule,
} from "./recurrence";

const MAX_TITLE = 120;
const MAX_LOCATION = 120;
const MAX_FIELDS = 20;
const MAX_FIELD_LABEL = 80;

const FIELD_TYPES = ["PERSON", "TEXT", "DOCUMENT"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

type ParsedField = {
  id: string | null;
  label: string;
  type: FieldType;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FREQS = [
  "MONTHLY_NTH_WEEKDAY",
  "YEARLY_NTH_WEEKDAY",
  "YEARLY_FIXED_DATE",
] as const;
type Freq = (typeof FREQS)[number];

type ParsedEvent = {
  title: string;
  location: string | null;
  allDay: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
  contentJson: string | null;
  attachmentIds: string[];
  date: string | null;
  endDate: string | null;
  endDayOffset: number | null;
  freq: Freq | null;
  weekday: number | null;
  ordinal: number | null;
  month: number | null;
  dayOfMonth: number | null;
};

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function toMinutes(time: string): number | null {
  const m = TIME_RE.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function intInRange(raw: string, min: number, max: number): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** Shared field validation for create + update. Returns null on bad input. */
function parseEventForm(
  kind: "ADHOC" | "RECURRING",
  formData: FormData,
): ParsedEvent | null {
  const title = str(formData, "title");
  if (!title || title.length > MAX_TITLE) return null;

  const location = str(formData, "location");
  if (location.length > MAX_LOCATION) return null;

  const allDay = formData.get("allDay") === "on";
  let startMinutes: number | null = null;
  let endMinutes: number | null = null;
  if (!allDay) {
    startMinutes = toMinutes(str(formData, "startTime"));
    if (startMinutes === null) return null;
    const endRaw = str(formData, "endTime");
    if (endRaw) {
      endMinutes = toMinutes(endRaw);
      if (endMinutes === null) return null;
    }
  }

  // Multi-day: ad hoc events may end on a later date; recurring events may
  // continue endDayOffset days past each occurrence (Friday -> Sunday).
  let endDate: string | null = null;
  let endDayOffset: number | null = null;
  if (kind === "ADHOC") {
    const raw = str(formData, "endDate");
    if (raw) {
      if (!parseISODate(raw)) return null;
      endDate = raw;
    }
  } else {
    const days = str(formData, "days");
    if (days) {
      const n = intInRange(days, 1, 14);
      if (n === null) return null;
      endDayOffset = n - 1 === 0 ? null : n - 1;
    }
  }

  // Recurring events carry no series-level content — description and
  // attachments live per occurrence date (CalendarOccurrence).
  const content =
    kind === "ADHOC"
      ? parseContentFields(formData)
      : { contentJson: null, attachmentIds: [] };
  if (!content) return null;
  const { contentJson, attachmentIds } = content;

  const parsed: ParsedEvent = {
    title,
    location: location || null,
    allDay,
    startMinutes,
    endMinutes,
    contentJson,
    attachmentIds,
    date: null,
    endDate,
    endDayOffset,
    freq: null,
    weekday: null,
    ordinal: null,
    month: null,
    dayOfMonth: null,
  };

  const multiDay = endDate !== null || endDayOffset !== null;
  // On a single day the end time must come after the start; across days
  // any end time is valid (Friday 16:00 -> Sunday 13:00).
  if (!multiDay && endMinutes !== null && startMinutes !== null && endMinutes <= startMinutes) {
    return null;
  }

  if (kind === "ADHOC") {
    const date = str(formData, "date");
    if (!parseISODate(date)) return null;
    parsed.date = date;
    // A same-or-earlier end date means a single-day event.
    if (parsed.endDate && parsed.endDate <= date) parsed.endDate = null;
    if (!parsed.endDate && endMinutes !== null && startMinutes !== null && endMinutes <= startMinutes) {
      return null;
    }
    return parsed;
  }

  const freq = str(formData, "freq") as Freq;
  if (!FREQS.includes(freq)) return null;
  parsed.freq = freq;

  if (freq === "MONTHLY_NTH_WEEKDAY" || freq === "YEARLY_NTH_WEEKDAY") {
    parsed.weekday = intInRange(str(formData, "weekday"), 1, 7);
    const ordinal = intInRange(str(formData, "ordinal"), -1, 4);
    parsed.ordinal = ordinal === 0 ? null : ordinal;
    if (parsed.weekday === null || parsed.ordinal === null) return null;
  }
  if (freq === "YEARLY_NTH_WEEKDAY" || freq === "YEARLY_FIXED_DATE") {
    parsed.month = intInRange(str(formData, "month"), 1, 12);
    if (parsed.month === null) return null;
  }
  if (freq === "YEARLY_FIXED_DATE") {
    if (parsed.month === null) return null;
    // 2001 is a non-leap year, so this also rejects 29 February — a yearly
    // event must exist every year.
    parsed.dayOfMonth = intInRange(
      str(formData, "dayOfMonth"),
      1,
      daysInMonth(2001, parsed.month),
    );
    if (parsed.dayOfMonth === null) return null;
  }
  return parsed;
}

/**
 * Parse the recurring series' structured field definitions from the form's
 * single `fieldsJson` input. Returns null on any malformed/oversized input.
 * An absent input is an empty list (event has no fields). `position` is the
 * array index, applied by the caller.
 */
function parseEventFields(formData: FormData): ParsedField[] | null {
  const raw = formData.get("fieldsJson");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length > MAX_FIELDS) return null;

  const fields: ParsedField[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const { id, label, type } = item as Record<string, unknown>;
    if (id !== undefined && typeof id !== "string") return null;
    if (typeof label !== "string") return null;
    const trimmed = label.trim();
    if (!trimmed || trimmed.length > MAX_FIELD_LABEL) return null;
    if (typeof type !== "string" || !FIELD_TYPES.includes(type as FieldType)) {
      return null;
    }
    fields.push({
      id: typeof id === "string" ? id : null,
      label: trimmed,
      type: type as FieldType,
    });
  }
  return fields;
}

/**
 * Reconcile a recurring event's field definitions against a parsed payload.
 * Matching ids are updated (label + position only — type is immutable);
 * id-less entries are created; existing fields absent from the payload are
 * deleted (cascading their per-date values). Every write is scoped by eventId
 * so a forged id can never touch another series' fields.
 */
async function reconcileEventFields(eventId: string, fields: ParsedField[]) {
  const existing = await prisma.eventField.findMany({
    where: { eventId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((f) => f.id));
  const keptIds = new Set<string>();

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  fields.forEach((field, index) => {
    if (field.id && existingIds.has(field.id)) {
      keptIds.add(field.id);
      ops.push(
        prisma.eventField.update({
          where: { id: field.id },
          data: { label: field.label, position: index },
        }),
      );
    } else {
      // No id, or an id that isn't ours — treat as a brand-new field.
      ops.push(
        prisma.eventField.create({
          data: {
            eventId,
            label: field.label,
            type: field.type,
            position: index,
          },
        }),
      );
    }
  });

  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    ops.push(
      prisma.eventField.deleteMany({
        where: { id: { in: removedIds }, eventId },
      }),
    );
  }

  if (ops.length > 0) await prisma.$transaction(ops);
}

const ID_RE = /^[A-Za-z0-9]+$/;

/**
 * Persist the structured field values for one occurrence. Drives off the
 * event's authoritative field list (so a stale/forged input can't create a
 * value for a foreign field). Each field: a present value is upserted into the
 * one relevant column (others nulled); an empty value deletes any existing row.
 * Document files are then claimed into the occurrence folder so they surface in
 * /files, mirroring claimAssets for attachments.
 */
async function saveOccurrenceFieldValues(
  eventId: string,
  occurrenceId: string,
  folderId: string,
  formData: FormData,
  userId: string,
) {
  const fields = await prisma.eventField.findMany({
    where: { eventId },
    select: { id: true, type: true },
  });
  if (fields.length === 0) return;

  // Only load the membership set when a PERSON field actually exists.
  let memberIds: Set<string> | null = null;
  if (fields.some((f) => f.type === "PERSON")) {
    const users = await prisma.user.findMany({ select: { id: true } });
    memberIds = new Set(users.map((u) => u.id));
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const docFileIds: string[] = [];

  for (const field of fields) {
    let text: string | null = null;
    let personId: string | null = null;
    let fileId: string | null = null;

    if (field.type === "TEXT") {
      const v = str(formData, `fv_text_${field.id}`);
      text = v || null;
    } else if (field.type === "PERSON") {
      const v = str(formData, `fv_person_${field.id}`);
      if (v && memberIds?.has(v)) personId = v;
    } else if (field.type === "DOCUMENT") {
      const v = str(formData, `fv_file_${field.id}`);
      if (v && ID_RE.test(v)) {
        fileId = v;
        docFileIds.push(v);
      }
    }

    const hasValue = text !== null || personId !== null || fileId !== null;
    if (hasValue) {
      ops.push(
        prisma.occurrenceFieldValue.upsert({
          where: {
            occurrenceId_fieldId: { occurrenceId, fieldId: field.id },
          },
          create: { occurrenceId, fieldId: field.id, text, personId, fileId },
          update: { text, personId, fileId },
        }),
      );
    } else {
      ops.push(
        prisma.occurrenceFieldValue.deleteMany({
          where: { occurrenceId, fieldId: field.id },
        }),
      );
    }
  }

  if (ops.length > 0) await prisma.$transaction(ops);

  // Move the acting user's freshly uploaded documents into the occurrence
  // folder. The folderId:null guard skips already-claimed files on re-save.
  if (docFileIds.length > 0) {
    await prisma.fileItem.updateMany({
      where: { id: { in: docFileIds }, folderId: null, uploadedById: userId },
      data: { folderId },
    });
  }
}

/**
 * Session + permission check for a given event kind. Any member manages
 * ad hoc events (wiki-style); recurring events are ADMIN/BESTYRELSE only.
 */
async function requireEventPermission(
  kind: "ADHOC" | "RECURRING",
  t: Dictionary,
) {
  const session = await requireSession();
  if (
    kind === "RECURRING" &&
    session.user.role !== "ADMIN" &&
    !session.user.extraRoles.includes("BESTYRELSE")
  ) {
    return { error: t.errors.recurringBoardOnly as string, session: null };
  }
  return { error: null, session };
}

function revalidateCalendar(eventId?: string) {
  revalidatePath("/calendar");
  if (eventId) revalidatePath(`/calendar/${eventId}`);
  revalidatePath("/files");
  revalidatePath("/forum");
}

export async function createEvent(formData: FormData) {
  const t = await getDict();
  const kind = str(formData, "kind") === "RECURRING" ? "RECURRING" : "ADHOC";
  const { error, session } = await requireEventPermission(kind, t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const parsed = parseEventForm(kind, formData);
  if (!parsed) return { error: t.errors.invalidInput };

  // Recurring events may define structured fields; ad hoc events never do.
  const fields = kind === "RECURRING" ? parseEventFields(formData) : [];
  if (!fields) return { error: t.errors.invalidInput };

  // Only ad hoc events own a series folder; recurring events get lazy
  // per-occurrence folders when content is added for a date.
  const folder =
    kind === "ADHOC"
      ? await prisma.folder.create({
          data: { name: parsed.title, createdById: session.user.id },
        })
      : null;
  const event = await prisma.calendarEvent.create({
    data: {
      kind,
      title: parsed.title,
      contentJson: parsed.contentJson,
      location: parsed.location,
      allDay: parsed.allDay,
      startMinutes: parsed.startMinutes,
      endMinutes: parsed.endMinutes,
      date: parsed.date,
      endDate: parsed.endDate,
      endDayOffset: parsed.endDayOffset,
      freq: parsed.freq,
      weekday: parsed.weekday,
      ordinal: parsed.ordinal,
      month: parsed.month,
      dayOfMonth: parsed.dayOfMonth,
      folderId: folder?.id ?? null,
      createdById: session.user.id,
    },
  });
  if (folder) await claimAssets(parsed, folder.id, session.user.id);
  if (fields.length > 0) {
    await prisma.eventField.createMany({
      data: fields.map((field, index) => ({
        eventId: event.id,
        label: field.label,
        type: field.type,
        position: index,
      })),
    });
  }
  // Ad hoc events get a discussion thread in the Begivenheder forum section
  // right away. Recurring events instead get a thread per instance, created
  // when that occurrence is first edited (see saveOccurrenceContent).
  if (kind === "ADHOC") {
    await createEventThread({
      eventId: event.id,
      title: parsed.title,
      createdById: session.user.id,
    });
  }
  await logEvent({
    actorId: session.user.id,
    action: "calendar.create",
    targetType: "calendarEvent",
    targetId: event.id,
    meta: { title: parsed.title, kind },
  });
  revalidateCalendar(event.id);
  return { ok: true, id: event.id };
}

export async function updateEvent(eventId: string, formData: FormData) {
  const t = await getDict();
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!existing) return { error: t.errors.eventNotFound };

  // Kind is immutable — permissions and fields both derive from it.
  const { error, session } = await requireEventPermission(existing.kind, t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const parsed = parseEventForm(existing.kind, formData);
  if (!parsed) return { error: t.errors.invalidInput };

  const fields =
    existing.kind === "RECURRING" ? parseEventFields(formData) : [];
  if (!fields) return { error: t.errors.invalidInput };

  // Ad hoc events keep a series folder in sync with the title; recurring
  // events have per-occurrence folders instead and never a series one.
  let folderId = existing.folderId;
  if (existing.kind === "ADHOC") {
    if (folderId) {
      await prisma.folder.update({
        where: { id: folderId },
        data: { name: parsed.title },
      });
    } else {
      const folder = await prisma.folder.create({
        data: { name: parsed.title, createdById: session.user.id },
      });
      folderId = folder.id;
    }
  }

  await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      title: parsed.title,
      contentJson: parsed.contentJson,
      location: parsed.location,
      allDay: parsed.allDay,
      startMinutes: parsed.startMinutes,
      endMinutes: parsed.endMinutes,
      date: parsed.date,
      endDate: parsed.endDate,
      endDayOffset: parsed.endDayOffset,
      freq: parsed.freq,
      weekday: parsed.weekday,
      ordinal: parsed.ordinal,
      month: parsed.month,
      dayOfMonth: parsed.dayOfMonth,
      folderId,
    },
  });
  if (existing.kind === "ADHOC" && folderId) {
    await claimAssets(parsed, folderId, session.user.id);
  }
  if (existing.kind === "RECURRING") {
    await reconcileEventFields(eventId, fields);
  }
  // Keep linked Begivenheder threads in sync with the event's title: the
  // single ad hoc thread, or every instance thread of a recurring series.
  if (existing.kind === "ADHOC") {
    await renameEventThread(eventId, parsed.title);
  } else {
    await renameOccurrenceThreadsForEvent(eventId, parsed.title);
  }
  await logEvent({
    actorId: session.user.id,
    action: "calendar.update",
    targetType: "calendarEvent",
    targetId: eventId,
    meta: { title: parsed.title, kind: existing.kind },
  });
  revalidateCalendar(eventId);
  return { ok: true, id: eventId };
}

export async function deleteEvent(eventId: string) {
  const t = await getDict();
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!existing) return { error: t.errors.eventNotFound };

  const { error, session } = await requireEventPermission(existing.kind, t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  // The folder and its files survive: assets stay discoverable in /files.
  // The linked Begivenheder thread also survives — its eventId is SetNull, so
  // the discussion remains as an archived thread.
  await prisma.calendarEvent.delete({ where: { id: eventId } });
  await logEvent({
    actorId: session.user.id,
    action: "calendar.delete",
    targetType: "calendarEvent",
    targetId: eventId,
    meta: { title: existing.title, kind: existing.kind },
  });
  revalidateCalendar();
  return { ok: true };
}

/**
 * Save the content (description + attachments) of one occurrence date of a
 * recurring event. The row and its folder ("{title} {date}") are created
 * lazily on first save, so every other date stays blank. Same permission as
 * the series: ADMIN/BESTYRELSE.
 */
export async function saveOccurrenceContent(
  eventId: string,
  date: string,
  formData: FormData,
) {
  const t = await getDict();
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
  });
  if (!event || event.kind !== "RECURRING" || !event.freq) {
    return { error: t.errors.eventNotFound };
  }
  const { error, session } = await requireEventPermission("RECURRING", t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  // The URL is user-editable — re-check that the date actually belongs to
  // this event's rule.
  const rule: RecurrenceRule = {
    freq: event.freq,
    weekday: event.weekday,
    ordinal: event.ordinal,
    month: event.month,
    dayOfMonth: event.dayOfMonth,
  };
  if (!isOccurrenceDate(rule, date)) return { error: t.errors.invalidInput };

  const content = parseContentFields(formData);
  if (!content) return { error: t.errors.invalidInput };

  const existing = await prisma.calendarOccurrence.findUnique({
    where: { eventId_date: { eventId, date } },
  });
  let folderId = existing?.folderId ?? null;
  if (!folderId) {
    const folder = await prisma.folder.create({
      data: {
        name: `${event.title} ${date}`,
        createdById: session.user.id,
      },
    });
    folderId = folder.id;
  }

  const occurrence = await prisma.calendarOccurrence.upsert({
    where: { eventId_date: { eventId, date } },
    create: { eventId, date, contentJson: content.contentJson, folderId },
    update: { contentJson: content.contentJson, folderId },
  });
  await claimAssets(content, folderId, session.user.id);
  await saveOccurrenceFieldValues(
    eventId,
    occurrence.id,
    folderId,
    formData,
    session.user.id,
  );
  // Editing an instance gives it its own Begivenheder thread (the date is
  // rendered from the occurrence; the title stays the series title).
  await ensureOccurrenceThread({
    occurrenceId: occurrence.id,
    title: event.title,
    createdById: session.user.id,
  });
  await logEvent({
    actorId: session.user.id,
    action: "calendar.occurrence.update",
    targetType: "calendarEvent",
    targetId: eventId,
    meta: { title: event.title, date },
  });
  revalidateCalendar(eventId);
  return { ok: true, id: eventId };
}

/**
 * Create or rotate the caller's personal iCal feed token. Rotating
 * invalidates the previous feed URL immediately.
 */
export async function regenerateCalendarToken() {
  const session = await requireSession();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { calendarToken: randomBytes(24).toString("base64url") },
  });
  await logEvent({
    actorId: session.user.id,
    action: "calendar.token.regenerate",
    targetType: "user",
    targetId: session.user.id,
  });
  revalidatePath("/profile");
  return { ok: true };
}
