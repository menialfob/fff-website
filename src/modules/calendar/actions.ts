"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n";
import { saveUpload } from "@/lib/storage";
import {
  daysInMonth,
  isOccurrenceDate,
  parseISODate,
  type RecurrenceRule,
} from "./recurrence";

const MAX_TITLE = 120;
const MAX_LOCATION = 120;
// Generous cap for a TipTap document — images live in files, not inline.
const MAX_CONTENT_BYTES = 512 * 1024;
const MAX_FILE_SIZE = 200 * 1024 * 1024; // matches serverActions.bodySizeLimit

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
  durationMinutes: number | null;
  contentJson: string | null;
  attachmentIds: string[];
  date: string | null;
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

/**
 * Rich content + attachment ids from a form. Returns null on invalid
 * content; an empty document is normalized to null.
 */
function parseContentFields(
  formData: FormData,
): { contentJson: string | null; attachmentIds: string[] } | null {
  let contentJson: string | null = str(formData, "contentJson") || null;
  if (contentJson) {
    if (Buffer.byteLength(contentJson, "utf8") > MAX_CONTENT_BYTES) return null;
    try {
      const doc = JSON.parse(contentJson);
      if (!doc || typeof doc !== "object" || doc.type !== "doc") return null;
      // An empty document is stored as null.
      if (doc.content?.length === 0) contentJson = null;
    } catch {
      return null;
    }
  }

  const attachmentIds = formData
    .getAll("attachmentIds")
    .filter(
      (v): v is string => typeof v === "string" && /^[A-Za-z0-9]+$/.test(v),
    );
  return { contentJson, attachmentIds };
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
  let durationMinutes: number | null = null;
  if (!allDay) {
    startMinutes = toMinutes(str(formData, "startTime"));
    if (startMinutes === null) return null;
    const endRaw = str(formData, "endTime");
    if (endRaw) {
      const end = toMinutes(endRaw);
      if (end === null || end <= startMinutes) return null;
      durationMinutes = end - startMinutes;
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
    durationMinutes,
    contentJson,
    attachmentIds,
    date: null,
    freq: null,
    weekday: null,
    ordinal: null,
    month: null,
    dayOfMonth: null,
  };

  if (kind === "ADHOC") {
    const date = str(formData, "date");
    if (!parseISODate(date)) return null;
    parsed.date = date;
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

/** File ids of inline images (`/api/files/<id>` sources) in a TipTap doc. */
function extractImageFileIds(contentJson: string | null): string[] {
  if (!contentJson) return [];
  const ids: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      attrs?: { src?: unknown };
      content?: unknown[];
    };
    if (n.type === "image" && typeof n.attrs?.src === "string") {
      const m = /^\/api\/files\/([A-Za-z0-9]+)$/.exec(n.attrs.src);
      if (m) ids.push(m[1]);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  try {
    walk(JSON.parse(contentJson));
  } catch {
    // Validated earlier; ignore.
  }
  return ids;
}

/**
 * Move the event's assets (inline images + attachments) into its folder so
 * they are discoverable in the files section. Only unfiled uploads owned by
 * the acting user are claimed — a foreign id can't steal files from other
 * folders or users.
 */
async function claimAssets(
  parsed: { contentJson: string | null; attachmentIds: string[] },
  folderId: string,
  userId: string,
) {
  const ids = [
    ...new Set([
      ...extractImageFileIds(parsed.contentJson),
      ...parsed.attachmentIds,
    ]),
  ];
  if (ids.length === 0) return;
  await prisma.fileItem.updateMany({
    where: { id: { in: ids }, folderId: null, uploadedById: userId },
    data: { folderId },
  });
}

function revalidateCalendar(eventId?: string) {
  revalidatePath("/calendar");
  if (eventId) revalidatePath(`/calendar/${eventId}`);
  revalidatePath("/files");
}

export async function createEvent(formData: FormData) {
  const t = await getDict();
  const kind = str(formData, "kind") === "RECURRING" ? "RECURRING" : "ADHOC";
  const { error, session } = await requireEventPermission(kind, t);
  if (error || !session) return { error: error ?? t.errors.invalidInput };

  const parsed = parseEventForm(kind, formData);
  if (!parsed) return { error: t.errors.invalidInput };

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
      durationMinutes: parsed.durationMinutes,
      date: parsed.date,
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
      durationMinutes: parsed.durationMinutes,
      date: parsed.date,
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

  await prisma.calendarOccurrence.upsert({
    where: { eventId_date: { eventId, date } },
    create: { eventId, date, contentJson: content.contentJson, folderId },
    update: { contentJson: content.contentJson, folderId },
  });
  await claimAssets(content, folderId, session.user.id);
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

/**
 * Upload one image/attachment from the event editor. The file lands unfiled
 * (folderId null) and is claimed into the event's folder on save.
 */
export async function uploadCalendarAsset(formData: FormData) {
  const session = await requireSession();
  const t = await getDict();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t.errors.chooseFile };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: t.errors.fileTooLarge };
  }

  const storedName = await saveUpload(file);
  const item = await prisma.fileItem.create({
    data: {
      name: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById: session.user.id,
    },
  });
  await logEvent({
    actorId: session.user.id,
    action: "file.upload",
    targetType: "file",
    targetId: item.id,
    meta: { name: file.name, size: file.size },
  });
  return {
    ok: true,
    id: item.id,
    url: `/api/files/${item.id}`,
    name: file.name,
    size: file.size,
    isImage: (file.type || "").startsWith("image/"),
  };
}
