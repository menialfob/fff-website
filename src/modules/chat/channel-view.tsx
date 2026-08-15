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
function markRead(channelId: string) {
  markChannelRead(channelId).then(refreshAppBadge).catch(() => {});
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
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // When the on-screen keyboard is open we size the panel to the visual
  // viewport instead of 100dvh (which no browser shrinks for the keyboard),
  // so the composer sits directly above the keyboard with no dead gap.
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  // Whether the fixed bottom tab bar still occupies space we must stay clear
  // of — true unless the keyboard is covering it.
  const [reserveTabBar, setReserveTabBar] = useState(true);
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
          if (ev.channelId !== channelId) return;
          setMessages((prev) =>
            prev.some((m) => m.id === ev.message.id)
              ? prev
              : [...prev, ev.message],
          );
          markRead(channelId);
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
    markRead(channelId);
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
  }, [messages, typing, panelHeight]);

  // Track the on-screen keyboard via the visual viewport so the composer isn't
  // hidden behind it and there's no dead space below it. Browsers disagree on
  // what a keyboard does: iOS Safari only shrinks the visual viewport, while
  // Android Chrome may also shrink the layout viewport (and window.innerHeight
  // with it) — but neither shrinks 100dvh, so CSS alone can't do this. That is
  // why the keyboard is detected by comparing against the tallest viewport seen
  // at this width rather than against window.innerHeight: on Android that
  // difference stays ~0 with the keyboard open, so the panel kept its full
  // 100dvh height and pushed the composer down behind the keyboard.
  // No-op on desktop and where visualViewport is unavailable.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let baseline = 0;
    let baselineWidth = 0;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const apply = () => {
      const el = rootRef.current;
      if (!el) return;
      // A width change is a rotation/resize, not a keyboard — re-baseline.
      if (vv.width !== baselineWidth) {
        baselineWidth = vv.width;
        baseline = 0;
      }
      baseline = Math.max(baseline, vv.height);
      const open = baseline - vv.height > 120;
      // The tab bar is fixed to the layout viewport. Where the keyboard shrank
      // that viewport too, the bar sits right above the keyboard and we must
      // keep clear of it; where only the visual viewport shrank, the bar is
      // behind the keyboard and reserving its height is dead space.
      setReserveTabBar(!open || window.innerHeight - vv.height < 120);
      if (!open) {
        setPanelHeight(null);
        return;
      }
      // Height from the panel's top to the bottom of the visible area. The
      // rect is in layout-viewport coordinates; vv.offsetTop is where the
      // visible area starts in those same coordinates.
      const top = el.getBoundingClientRect().top - vv.offsetTop;
      const h = vv.height - top;
      setPanelHeight(h > 160 ? h : null);
    };

    // Keyboards animate in, and parts of them (Android's suggestion strip) can
    // land a frame or two after the keys, so re-measure a few times instead of
    // trusting a single event.
    const remeasure = () => {
      apply();
      timers.forEach(clearTimeout);
      timers = [setTimeout(apply, 150), setTimeout(apply, 400)];
    };

    apply();
    vv.addEventListener("resize", remeasure);
    vv.addEventListener("scroll", apply);
    window.addEventListener("resize", remeasure);
    document.addEventListener("focusin", remeasure);
    return () => {
      vv.removeEventListener("resize", remeasure);
      vv.removeEventListener("scroll", apply);
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("focusin", remeasure);
      timers.forEach(clearTimeout);
    };
  }, []);

  // When the app returns to the foreground (e.g. after tapping a push
  // notification), the SSE connection was suspended while backgrounded, so any
  // messages that arrived meanwhile were missed. Refetch the latest and merge.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      recentMessages(channelId)
        .then((fresh) => {
          if (fresh.length) setMessages((prev) => mergeMessages(prev, fresh));
          markRead(channelId);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [channelId]);

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
      void sendTyping(channelId);
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
    // the column reaches the tab bar without adding page scroll. With no
    // keyboard the height comes from 100dvh and the tab bar's height is
    // reserved as bottom padding; with the keyboard open we size to the visual
    // viewport (panelHeight) and drop that reserve wherever the keyboard covers
    // the tab bar. The bottom safe-area inset is always part of this padding,
    // so the composer/poll form below don't add their own.
    // The message list (min-h-0 + overflow) is the only thing that scrolls.
    <div
      ref={rootRef}
      style={panelHeight ? { height: `${panelHeight}px` } : undefined}
      className={`-mb-28 flex flex-col md:-mb-12 md:h-[calc(100dvh-6rem)] md:pb-4 ${
        panelHeight ? "" : "h-[calc(100dvh-5.5rem-env(safe-area-inset-top))]"
      } ${
        reserveTabBar
          ? "pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
          : "pb-[env(safe-area-inset-bottom)]"
      }`}
    >
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
        <div className="flex items-end gap-2">
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
