"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { MessageDTO, RealtimeEvent } from "@/lib/realtime";
import { btnPrimary } from "@/components/ui";
import { MessageItem } from "./message-item";
import { PollComposer } from "./poll-composer";
import {
  createPoll,
  markChannelRead,
  sendMessage,
  sendTyping,
  toggleReaction,
  votePoll,
} from "./actions";

const TYPING_THROTTLE_MS = 3000;
const TYPING_CLEAR_MS = 4000;

export function ChannelView({
  channelId,
  channelName,
  viewerId,
  members,
  initialMessages,
}: {
  channelId: string;
  channelName: string;
  viewerId: string;
  members: { id: string; name: string }[];
  initialMessages: MessageDTO[];
}) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<MessageDTO[]>(initialMessages);
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<{ id: string; name: string }[]>([]);
  const [text, setText] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [pending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const nameById = useCallback(
    (id: string) => members.find((m) => m.id === id)?.name ?? "",
    [members],
  );

  // Live stream. EventSource auto-reconnects, so a dropped connection (e.g. a
  // deploy) heals itself; on reconnect we simply resume receiving events.
  useEffect(() => {
    const es = new EventSource("/api/chat/stream");
    es.onmessage = (e) => {
      let ev: RealtimeEvent;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (ev.type) {
        case "message":
          if (ev.channelId !== channelId) return;
          setMessages((prev) =>
            prev.some((m) => m.id === ev.message.id)
              ? prev
              : [...prev, ev.message],
          );
          void markChannelRead(channelId);
          break;
        case "reaction":
          if (ev.channelId !== channelId) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === ev.messageId ? { ...m, reactions: ev.reactions } : m,
            ),
          );
          break;
        case "poll":
          setMessages((prev) =>
            prev.map((m) =>
              m.poll && m.poll.id === ev.pollId
                ? { ...m, poll: { ...m.poll, tallies: ev.tallies } }
                : m,
            ),
          );
          break;
        case "typing": {
          if (ev.channelId !== channelId || ev.user.id === viewerId) return;
          const { id, name } = ev.user;
          setTyping((prev) =>
            prev.some((u) => u.id === id) ? prev : [...prev, { id, name }],
          );
          const timers = typingTimers.current;
          const existing = timers.get(id);
          if (existing) clearTimeout(existing);
          timers.set(
            id,
            setTimeout(() => {
              setTyping((prev) => prev.filter((u) => u.id !== id));
              timers.delete(id);
            }, TYPING_CLEAR_MS),
          );
          break;
        }
        case "presence":
          setOnline(ev.online);
          break;
      }
    };
    return () => es.close();
  }, [channelId, viewerId]);

  // Mark read on open and stop typing timers on unmount.
  useEffect(() => {
    void markChannelRead(channelId);
    const timers = typingTimers.current;
    return () => {
      timers.forEach((t2) => clearTimeout(t2));
      timers.clear();
    };
  }, [channelId]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  function onType(value: string) {
    setText(value);
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      void sendTyping(channelId);
    }
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    startTransition(async () => {
      await sendMessage(channelId, body);
    });
  }

  function onReact(messageId: string, emoji: string) {
    startTransition(async () => {
      await toggleReaction(messageId, emoji);
    });
  }

  function onVote(pollId: string, optionId: string) {
    startTransition(async () => {
      await votePoll(pollId, optionId);
    });
  }

  function onCreatePoll(question: string, options: string[], multiple: boolean) {
    startTransition(async () => {
      await createPoll(channelId, question, options, multiple);
      setShowPoll(false);
    });
  }

  const onlineOthers = online.filter((id) => id !== viewerId);
  const typingLabel =
    typing.length === 1
      ? t.chat.typingOne.replace("{name}", typing[0].name)
      : typing.length > 1
        ? t.chat.typingMany.replace("{count}", String(typing.length))
        : "";

  return (
    // Fill the space between the sticky app header (h-16 + safe-area) and the
    // fixed mobile tab bar. Cancel the shared <main> bottom padding (-mb-28) so
    // the column reaches the tab bar without adding page scroll, and reserve
    // the tab bar's height as bottom padding so the composer stays above it.
    // The message list (min-h-0 + overflow) is the only thing that scrolls.
    <div className="-mb-28 flex h-[calc(100dvh-5.5rem-env(safe-area-inset-top))] flex-col pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:-mb-12 md:h-[calc(100dvh-6rem)] md:pb-4">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <h1 className="text-lg font-semibold text-white">{channelName}</h1>
        <span
          className="flex items-center gap-1.5 text-xs text-zinc-400"
          title={onlineOthers.map(nameById).filter(Boolean).join(", ")}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
          {t.chat.online.replace("{count}", String(online.length))}
        </span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            {t.chat.empty}
          </p>
        ) : (
          messages.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              viewerId={viewerId}
              locale={locale}
              onToggleReaction={onReact}
              onVote={onVote}
            />
          ))
        )}
      </div>

      <div className="min-h-[1.25rem] px-1 text-xs text-zinc-500">
        {typingLabel}
      </div>

      {showPoll ? (
        <PollComposer
          onCreate={onCreatePoll}
          onClose={() => setShowPoll(false)}
          pending={pending}
        />
      ) : (
        <div className="flex items-end gap-2 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={() => setShowPoll(true)}
            aria-label={t.chat.newPoll}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-lg text-zinc-300 transition hover:border-white/20"
          >
            📊
          </button>
          <textarea
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={t.chat.messagePlaceholder}
            className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-400/50"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !text.trim()}
            className={`${btnPrimary} h-11 shrink-0`}
          >
            {t.chat.send}
          </button>
        </div>
      )}
    </div>
  );
}
