import type { CalendarEvent, CalendarOccurrence } from "@prisma/client";
import {
  addDays,
  nextOccurrences,
  type RecurrenceRule,
} from "./recurrence";

export type FeedEvent = CalendarEvent & { occurrences: CalendarOccurrence[] };

/**
 * Hand-written iCalendar (RFC 5545) generation for the subscription feed.
 * Times are emitted as Danish wall-clock with TZID=Europe/Copenhagen plus a
 * static VTIMEZONE, so clients handle DST; recurring events become native
 * RRULEs so a subscription covers every future occurrence.
 */

const TZID = "Europe/Copenhagen";

// EU rules since 1996: CEST from the last Sunday of March, CET from the
// last Sunday of October.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:19961027T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19970330T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]; // ISO 1..7

/** TEXT value escaping per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to lines of at most 75 octets (UTF-8 bytes, not
 * characters — Danish letters are two bytes). Continuations begin with a
 * single space. iOS rejects feeds folded on characters instead of octets.
 */
function foldLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let budget = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (Buffer.byteLength(current, "utf8") + size > budget) {
      out.push(current);
      current = " ";
      budget = 75; // the leading space counts toward the 75
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** "YYYY-MM-DD" → "YYYYMMDD". */
function basicDate(iso: string): string {
  return iso.replaceAll("-", "");
}

/** UTC timestamp in iCalendar basic format, e.g. 20260704T120000Z. */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Local (Danish) date-time value: YYYYMMDDTHHMMSS, no zone suffix. */
function localDateTime(iso: string, minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${basicDate(iso)}T${h}${m}00`;
}

/** A calendar date in Copenhagen for a stored UTC instant. */
function copenhagenDateOf(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function ruleOf(event: CalendarEvent): RecurrenceRule | null {
  if (event.kind !== "RECURRING" || !event.freq) return null;
  return {
    freq: event.freq,
    weekday: event.weekday,
    ordinal: event.ordinal,
    month: event.month,
    dayOfMonth: event.dayOfMonth,
  };
}

function rruleOf(rule: RecurrenceRule): string {
  const byday =
    rule.weekday != null && rule.ordinal != null
      ? `${rule.ordinal}${BYDAY[rule.weekday - 1]}`
      : "";
  switch (rule.freq) {
    case "MONTHLY_NTH_WEEKDAY":
      return `RRULE:FREQ=MONTHLY;BYDAY=${byday}`;
    case "YEARLY_NTH_WEEKDAY":
      return `RRULE:FREQ=YEARLY;BYMONTH=${rule.month};BYDAY=${byday}`;
    case "YEARLY_FIXED_DATE":
      return `RRULE:FREQ=YEARLY;BYMONTH=${rule.month};BYMONTHDAY=${rule.dayOfMonth}`;
  }
}

/** First ~1000 chars of plain text from a TipTap document, for DESCRIPTION. */
function plainTextOf(contentJson: string | null): string {
  if (!contentJson) return "";
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && n.text) parts.push(n.text);
    if (Array.isArray(n.content)) {
      n.content.forEach(walk);
      if (n.type === "paragraph" || n.type === "heading") parts.push("\n");
    }
  };
  try {
    walk(JSON.parse(contentJson));
  } catch {
    return "";
  }
  return parts.join("").replace(/\n+/g, "\n").trim().slice(0, 1000);
}

/**
 * DTSTART/DTEND (or RECURRENCE-ID) value lines for one date, matching the
 * event's all-day/timed shape. The same helper produces the series DTSTART
 * and each override's RECURRENCE-ID so the two always agree — clients
 * silently drop overrides whose RECURRENCE-ID doesn't match an instance.
 */
function dateProps(
  event: CalendarEvent,
  date: string,
): { start: string; startEnd: string[] } {
  // Last calendar day of this instance: an explicit end date for ad hoc
  // events, occurrence + offset for recurring ones.
  const endDay =
    event.kind === "ADHOC" && event.endDate && event.endDate > date
      ? event.endDate
      : addDays(date, event.endDayOffset ?? 0);

  if (event.allDay || event.startMinutes === null) {
    return {
      start: `;VALUE=DATE:${basicDate(date)}`,
      startEnd: [
        `DTSTART;VALUE=DATE:${basicDate(date)}`,
        // DTEND is exclusive for all-day events.
        `DTEND;VALUE=DATE:${basicDate(addDays(endDay, 1))}`,
      ],
    };
  }
  const start = event.startMinutes;
  // Same-day events default to one hour; multi-day ones end at the start
  // time on the last day unless an end time was given.
  const sameDay = endDay === date;
  const end = event.endMinutes ?? (sameDay ? start + 60 : start);
  return {
    start: `;TZID=${TZID}:${localDateTime(date, start)}`,
    startEnd: [
      `DTSTART;TZID=${TZID}:${localDateTime(date, start)}`,
      `DTEND;TZID=${TZID}:${localDateTime(endDay, end)}`,
    ],
  };
}

function veventLines(event: FeedEvent, baseUrl: string): string[] {
  const rule = ruleOf(event);

  // The series (or single) start date. For recurring events DTSTART must
  // itself satisfy the RRULE, so take the first occurrence on/after the day
  // the event was created; clients misrender otherwise.
  let startDate: string | null = null;
  if (rule) {
    startDate =
      nextOccurrences(rule, copenhagenDateOf(event.createdAt), 1)[0] ?? null;
  } else if (event.date) {
    startDate = event.date;
  }
  if (!startDate) return [];

  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@fff-website`,
    `DTSTAMP:${utcStamp(event.updatedAt)}`,
    `LAST-MODIFIED:${utcStamp(event.updatedAt)}`,
    // Monotonically increasing with every edit, so clients refresh the
    // whole series.
    `SEQUENCE:${Math.floor(event.updatedAt.getTime() / 1000)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  // Recurring events have no series-level description — content is per
  // occurrence and emitted as override VEVENTs below.
  if (!rule) {
    const description = plainTextOf(event.contentJson);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  }
  lines.push(`URL:${baseUrl}/calendar/${event.id}`);
  lines.push(...dateProps(event, startDate).startEnd);
  if (rule) lines.push(rruleOf(rule));
  lines.push("END:VEVENT");

  // One override VEVENT per occurrence that carries content: same UID plus
  // RECURRENCE-ID is RFC 5545's "this instance differs" mechanism.
  if (rule) {
    for (const occ of event.occurrences) {
      const description = plainTextOf(occ.contentJson);
      if (!description || occ.date < startDate) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${event.id}@fff-website`,
        `RECURRENCE-ID${dateProps(event, occ.date).start}`,
        `DTSTAMP:${utcStamp(occ.updatedAt)}`,
        `LAST-MODIFIED:${utcStamp(occ.updatedAt)}`,
        `SEQUENCE:${Math.floor(occ.updatedAt.getTime() / 1000)}`,
        `SUMMARY:${escapeText(event.title)}`,
      );
      if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
      lines.push(`DESCRIPTION:${escapeText(description)}`);
      lines.push(`URL:${baseUrl}/calendar/${event.id}?d=${occ.date}`);
      lines.push(...dateProps(event, occ.date).startEnd);
      lines.push("END:VEVENT");
    }
  }
  return lines;
}

export function buildIcs(
  events: FeedEvent[],
  options: { calendarName: string; baseUrl: string },
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FFF//Calendar//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
    `X-WR-TIMEZONE:${TZID}`,
    // Hint clients to refresh hourly.
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...VTIMEZONE,
    ...events.flatMap((event) => veventLines(event, options.baseUrl)),
    "END:VCALENDAR",
  ];
  // CRLF line endings and 75-octet folding are both required — iOS rejects
  // bare LF.
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}
