"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { dayKey, formatDayLabel, msUntilNextDay } from "@/lib/i18n";
import type { MessageDTO, RealtimeEvent } from "@/lib/realtime";
import { btnPrimary } from "@/components/ui";
import { MessageItem } from "./message-item";
import { PollComposer } from "./poll-composer";
import { ConversationInfo } from "./conversation-info";
import {
  createPoll,
  markConversationRead,
  recentMessages,
  sendMessage,
  sendTyping,
  toggleReaction,
  votePoll,
} from "./actions";
import { refreshAppBadge } from "@/modules/notifications/app-badge";

const TYPING_THROTTLE_MS = 3000;
const TYPING_CLEAR_MS = 4000;
// Grow the composer up to this height (px), then it scrolls internally.
const COMPOSER_MAX_PX = 128;

/** Move the read cursor, then refresh the app-icon badge it feeds. */
function markRead(conversationId: string) {
  markConversationRead(conversationId).then(refreshAppBadge).catch(() => {});
}

/** Union two message lists by id, ordered oldest-first. */
function mergeMessages(a: MessageDTO[], b: MessageDTO[]): MessageDTO[] {
  const byId = new Map<string, MessageDTO>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) =>
    x.createdAt.localeCompare(y.createdAt),
  );
}

/** Split a thread into calendar days, oldest first. */
function groupByDay(messages: MessageDTO[]) {
  const days: { key: string; at: Date; messages: MessageDTO[] }[] = [];
  for (const m of messages) {
    const at = new Date(m.createdAt);
    const key = dayKey(at);
    const current = days[days.length - 1];
    if (current && current.key === key) current.messages.push(m);
    else days.push({ key, at, messages: [m] });
  }
  return days;
}

/** Date heading above the first message of each day, pinned while you scroll. */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center">
      <span className="rounded-full border border-white/[0.06] bg-panel/90 px-3 py-1 text-xs font-medium text-zinc-400 backdrop-blur">
        {label}
      </span>
    </div>
  );
}

/**
 * A "now" that ticks over at midnight, so a chat left open overnight stops
 * calling yesterday's messages "I dag". Reschedules after every tick, which
 * also covers a timer that fired early across a DST change.
 */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextDay() + 1000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

export function ConversationView({
  conversationId,
  conversationName,
  conversationType,
  isAdmin,
  viewerId,
  members,
  initialMessages,
}: {
  conversationId: string;
  conversationName: string;
  conversationType: "CHANNEL" | "DM" | "GROUP";
  isAdmin: boolean;
  viewerId: string;
  members: { id: string; name: string; avatarUrl: string | null }[];
  initialMessages: MessageDTO[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [showInfo, setShowInfo] = useState(false);
  const [messages, setMessages] = useState<MessageDTO[]>(initialMessages);
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<{ id: string; name: string }[]>([]);
  const [text, setText] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [pending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // When the on-screen keyboard is open we size the panel to the visual
  // viewport instead of 100dvh (which iOS doesn't shrink for the keyboard),
  // so the composer sits directly above the keyboard with no dead gap.
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // On touch devices Enter/Return should insert a newline (send via the button,
  // the usual mobile chat convention); only desktop uses Enter-to-send.
  const [isTouch, setIsTouch] = useState(false);

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
          if (ev.conversationId !== conversationId) return;
          setMessages((prev) =>
            prev.some((m) => m.id === ev.message.id)
              ? prev
              : [...prev, ev.message],
          );
          markRead(conversationId);
          break;
        case "reaction":
          if (ev.conversationId !== conversationId) return;
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
          if (ev.conversationId !== conversationId || ev.user.id === viewerId) return;
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
        case "conversation":
          if (ev.conversationId !== conversationId) return;
          if (
            conversationType !== "CHANNEL" &&
            !ev.memberIds.includes(viewerId)
          ) {
            // Removed from (or left) this conversation — nothing to see here.
            router.push("/chat");
          } else {
            // Rename / membership change: re-render the server bits.
            router.refresh();
          }
          break;
      }
    };
    return () => es.close();
  }, [conversationId, conversationType, viewerId, router]);

  // Mark read on open and stop typing timers on unmount.
  useEffect(() => {
    markRead(conversationId);
    const timers = typingTimers.current;
    return () => {
      timers.forEach((t2) => clearTimeout(t2));
      timers.clear();
    };
  }, [conversationId]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, panelHeight]);

  // Track the on-screen keyboard via the visual viewport so the composer isn't
  // hidden behind it and there's no dead space below it (iOS doesn't shrink
  // 100dvh for the keyboard). No-op where visualViewport is unavailable.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const el = rootRef.current;
      if (!el) return;
      const open = window.innerHeight - vv.height > 120;
      setKeyboardOpen(open);
      if (open) {
        // Height from the panel's top to the bottom of the visible area.
        const top = el.getBoundingClientRect().top;
        const h = vv.height - top;
        setPanelHeight(h > 160 ? h : null);
      } else {
        setPanelHeight(null);
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  // When the app returns to the foreground (e.g. after tapping a push
  // notification), the SSE connection was suspended while backgrounded, so any
  // messages that arrived meanwhile were missed. Refetch the latest and merge.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      recentMessages(conversationId)
        .then((fresh) => {
          if (fresh.length) setMessages((prev) => mergeMessages(prev, fresh));
          markRead(conversationId);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [conversationId]);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  function autosizeComposer() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
  }

  function onType(value: string) {
    setText(value);
    autosizeComposer();
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      void sendTyping(conversationId);
    }
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    // Reset the grown composer back to a single row.
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
    startTransition(async () => {
      await sendMessage(conversationId, body);
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
      await createPoll(conversationId, question, options, multiple);
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
    // the column reaches the tab bar without adding page scroll. When the
    // keyboard is closed, reserve the tab bar's height as bottom padding so the
    // composer stays above it; when it's open we size to the visual viewport
    // (panelHeight) and drop that reserve since the keyboard covers the tab bar.
    // The message list (min-h-0 + overflow) is the only thing that scrolls.
    <div
      ref={rootRef}
      style={panelHeight ? { height: `${panelHeight}px` } : undefined}
      className={`-mb-28 flex flex-col md:-mb-12 md:h-[calc(100dvh-6rem)] md:pb-4 ${
        keyboardOpen
          ? "pb-[env(safe-area-inset-bottom)]"
          : "h-[calc(100dvh-5.5rem-env(safe-area-inset-top))] pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="min-w-0 text-left"
          aria-label={t.chat.conversationInfo}
        >
          <h1 className="truncate text-lg font-semibold text-white">
            {conversationName}
          </h1>
        </button>
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
          title={onlineOthers.map(nameById).filter(Boolean).join(", ")}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
          {t.chat.online.replace("{count}", String(online.length))}
        </button>
      </header>

      {showInfo && (
        <ConversationInfo
          conversationId={conversationId}
          conversationType={conversationType}
          conversationName={conversationName}
          members={members}
          online={online}
          viewerId={viewerId}
          isAdmin={isAdmin}
          onClose={() => setShowInfo(false)}
        />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            {t.chat.empty}
          </p>
        ) : (
          // One section per day: scoping the heading to its own group is what
          // makes it stick to the top only while that day is on screen.
          groupByDay(messages).map((day) => (
            <section key={day.key} className="space-y-4">
              <DayDivider label={formatDayLabel(day.at, locale, t, now)} />
              {day.messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  viewerId={viewerId}
                  locale={locale}
                  onToggleReaction={onReact}
                  onVote={onVote}
                />
              ))}
            </section>
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
            ref={textareaRef}
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              // Desktop: Enter sends, Shift+Enter newlines. Touch: Enter always
              // inserts a newline (send via the button).
              if (e.key === "Enter" && !e.shiftKey && !isTouch) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={t.chat.messagePlaceholder}
            className="max-h-32 min-h-[2.75rem] flex-1 resize-none overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-400/50"
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
