"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import {
  formatDateTime,
  formatTime,
  intlLocale,
  type Locale,
} from "@/lib/i18n";
import type { EventCardDTO, MessageDTO } from "@/lib/realtime";
import { PollCard } from "./poll-card";

function EventCard({ event, locale }: { event: EventCardDTO; locale: Locale }) {
  const { t } = useI18n();
  const dateLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${event.date}T00:00:00`));

  return (
    <div className="mt-1 w-full max-w-sm rounded-xl border border-lime-400/25 bg-lime-400/[0.04] p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
        <span aria-hidden>📅</span>
        {event.title}
      </p>
      <p className="mt-0.5 text-sm capitalize text-zinc-300">{dateLabel}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">
          {t.chat.eventGoing.replace("{count}", String(event.goingCount))}
        </span>
        <Link
          href={`/calendar/${event.eventId}?d=${event.date}`}
          className="rounded-full bg-lime-500 px-3 py-1 text-xs font-semibold text-black transition hover:bg-lime-400"
        >
          {t.chat.eventSignUp}
        </Link>
      </div>
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "🙏"];

const urlRegex = /(https?:\/\/[^\s]+)/g;

/** Render plain text with clickable links (nodes, never dangerouslySetInnerHTML). */
function renderBody(text: string) {
  return text.split(urlRegex).map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-300 underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function MessageItem({
  message,
  viewerId,
  locale,
  onToggleReaction,
  onVote,
}: {
  message: MessageDTO;
  viewerId: string;
  locale: Locale;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onVote: (pollId: string, optionId: string) => void;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const mine = message.author?.id === viewerId;
  const name = message.author?.name ?? t.chat.unknownAuthor;
  const createdAt = new Date(message.createdAt);

  return (
    <div className="group flex gap-2.5">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-xs font-bold text-white"
        aria-hidden
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white">
            {mine ? t.chat.you : name}
          </span>
          {/* The day comes from the divider above; the full stamp is a
              hover/long-press affordance for older messages. */}
          <time
            dateTime={message.createdAt}
            title={formatDateTime(createdAt, locale)}
            className="text-xs text-zinc-500"
          >
            {formatTime(createdAt, locale)}
          </time>
        </div>

        {message.body && (
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">
            {renderBody(message.body)}
          </p>
        )}

        {message.event && (
          <EventCard event={message.event} locale={locale} />
        )}

        {message.poll && (
          <PollCard poll={message.poll} viewerId={viewerId} onVote={onVote} />
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {message.reactions.map((r) => {
            const reacted = r.userIds.includes(viewerId);
            return (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onToggleReaction(message.id, r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                  reacted
                    ? "border-violet-400/60 bg-violet-500/15 text-white"
                    : "border-white/[0.08] text-zinc-300 hover:border-white/20"
                }`}
              >
                <span aria-hidden>{r.emoji}</span>
                <span className="tabular-nums">{r.count}</span>
              </button>
            );
          })}

          {/* React affordance: opens a small quick-emoji bar. */}
          <div className="relative">
            {/* Always visible on touch (no hover); a touch more prominent on
                hover for pointer devices. */}
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              aria-label={t.chat.addReaction}
              className="flex h-6 items-center rounded-full border border-white/[0.06] px-2 text-xs text-zinc-500 transition hover:border-white/20 hover:text-zinc-200 md:opacity-70 md:group-hover:opacity-100"
            >
              <span aria-hidden>🙂+</span>
            </button>
            {pickerOpen && (
              <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full border border-white/10 bg-panel p-1 shadow-lg">
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onToggleReaction(message.id, e);
                      setPickerOpen(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base transition hover:bg-white/10"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
