"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import {
  formatDateTime,
  formatTime,
  intlLocale,
  type Locale,
} from "@/lib/i18n";
import type { EventCardDTO, MessageDTO } from "@/lib/realtime";
import { Avatar } from "@/components/avatar";
import { PollCard } from "./poll-card";
import { MessageMenu } from "./message-menu";

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

// Long-press before the message menu opens (touch).
const LONG_PRESS_MS = 450;
// Horizontal drag distance that triggers swipe-to-reply.
const SWIPE_TRIGGER_PX = 56;
const SWIPE_MAX_PX = 72;

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
  onReply,
  onEdit,
  onDelete,
  onJumpTo,
}: {
  message: MessageDTO;
  viewerId: string;
  locale: Locale;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onVote: (pollId: string, optionId: string) => void;
  onReply: (message: MessageDTO) => void;
  onEdit: (message: MessageDTO) => void;
  onDelete: (messageId: string) => void;
  onJumpTo: (messageId: string) => void;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const mine = message.author?.id === viewerId;
  const name = message.author?.name ?? t.chat.unknownAuthor;
  const createdAt = new Date(message.createdAt);

  // Touch gesture state: long-press opens the menu, a horizontal right-drag
  // replies. Any scroll (vertical move) cancels both.
  const touch = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout> | null;
    swiped: boolean;
  } | null>(null);

  function cancelLongPress() {
    if (touch.current?.timer) {
      clearTimeout(touch.current.timer);
      touch.current.timer = null;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (message.deleted) return;
    const t0 = e.touches[0];
    touch.current = {
      x: t0.clientX,
      y: t0.clientY,
      timer: setTimeout(() => {
        setMenuOpen(true);
        touch.current = null;
      }, LONG_PRESS_MS),
      swiped: false,
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    const state = touch.current;
    if (!state) return;
    const t0 = e.touches[0];
    const dx = t0.clientX - state.x;
    const dy = t0.clientY - state.y;
    if (Math.abs(dy) > 24) {
      // Scrolling — abandon both gestures.
      cancelLongPress();
      touch.current = null;
      setDragX(0);
      return;
    }
    if (Math.abs(dx) > 8) cancelLongPress();
    if (dx > 0) {
      setDragX(Math.min(dx, SWIPE_MAX_PX));
      if (dx > SWIPE_TRIGGER_PX && !state.swiped) {
        state.swiped = true;
        onReply(message);
      }
    }
  }

  function onTouchEnd() {
    cancelLongPress();
    touch.current = null;
    setDragX(0);
  }

  function copyBody() {
    navigator.clipboard?.writeText(message.body).catch(() => {});
  }

  if (message.deleted) {
    return (
      <div className="flex gap-2.5 opacity-70">
        <Avatar
          id={message.author?.id ?? "deleted"}
          name={name}
          avatarUrl={message.author?.avatarUrl ?? null}
          size="sm"
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-zinc-400">
              {mine ? t.chat.you : name}
            </span>
            <time
              dateTime={message.createdAt}
              className="text-xs text-zinc-600"
            >
              {formatTime(createdAt, locale)}
            </time>
          </div>
          <p className="text-sm italic text-zinc-500">{t.chat.messageDeleted}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative flex gap-2.5 [@media(pointer:coarse)]:select-none"
      style={
        dragX
          ? { transform: `translateX(${dragX}px)`, transition: "none" }
          : { transition: "transform 150ms ease" }
      }
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Reply hint revealed while dragging. */}
      {dragX > 8 && (
        <span
          aria-hidden
          className="absolute -left-7 top-1/2 -translate-y-1/2 text-lg"
          style={{ opacity: Math.min(dragX / SWIPE_TRIGGER_PX, 1) }}
        >
          ↩️
        </span>
      )}

      <Avatar
        id={message.author?.id ?? "deleted"}
        name={name}
        avatarUrl={message.author?.avatarUrl ?? null}
        size="sm"
        className="mt-0.5"
      />
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
          {message.editedAt && (
            <span
              className="text-xs text-zinc-600"
              title={formatDateTime(new Date(message.editedAt), locale)}
            >
              {t.chat.edited}
            </span>
          )}
          {/* Desktop affordance: kebab on hover. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t.chat.messageActions}
            className="ml-auto hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200 md:flex md:opacity-0 md:group-hover:opacity-100"
          >
            ⋯
          </button>
        </div>

        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo(message.replyTo!.id)}
            className="mt-0.5 block w-full max-w-sm rounded-lg border-l-2 border-violet-400/60 bg-white/[0.04] px-2.5 py-1.5 text-left transition hover:bg-white/[0.07]"
          >
            <span className="block text-xs font-semibold text-violet-300">
              {message.replyTo.authorName ?? t.chat.unknownAuthor}
            </span>
            <span className="block truncate text-xs text-zinc-400">
              {message.replyTo.deleted
                ? t.chat.messageDeleted
                : message.replyTo.preview}
            </span>
          </button>
        )}

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

      {menuOpen && (
        <MessageMenu
          canEdit={mine && !message.poll}
          canDelete={mine}
          onReply={() => onReply(message)}
          onEdit={() => onEdit(message)}
          onDelete={() => onDelete(message.id)}
          onCopy={copyBody}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
