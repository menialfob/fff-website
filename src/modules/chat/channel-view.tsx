"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { dayKey, formatDayLabel, msUntilNextDay } from "@/lib/i18n";
import type { MessageDTO, RealtimeEvent } from "@/lib/realtime";
import { btnPrimary } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { MessageItem } from "./message-item";
import { PollComposer } from "./poll-composer";
import { ConversationInfo } from "./conversation-info";
import { SeenBy } from "./seen-by";
import { compressImage, uploadAttachment } from "./attachment-upload";
import type { AttachmentDTO } from "@/lib/realtime";
import {
  aroundMessages,
  createPoll,
  deleteMessage,
  editMessage,
  markConversationRead,
  newerMessages,
  olderMessages,
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
// "At the tail" tolerance: within this many px of the bottom counts as there.
const AT_BOTTOM_PX = 80;
// How long a jumped-to message stays highlighted.
const HIGHLIGHT_MS = 2000;

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

/** A message being sent optimistically (not yet acknowledged by the server). */
type OutboxItem = {
  clientId: string;
  body: string;
  createdAt: string;
  failed: boolean;
  attachmentIds: string[];
  attachmentCount: number;
};

/** An attachment being prepared in the composer. */
type DraftAttachment = {
  localId: string;
  name: string;
  isImage: boolean;
  progress: number;
  dto: AttachmentDTO | null;
  failed: boolean;
};

const MAX_DRAFTS = 10;

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

/** "New messages" line marking where unread content starts. */
function UnreadDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-violet-400/40" />
      <span className="text-xs font-semibold text-violet-300">{label}</span>
      <span className="h-px flex-1 bg-violet-400/40" />
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
  viewerName,
  viewerAvatarUrl,
  members,
  initialMessages,
  initialHasOlder,
  initialHasNewer,
  initialLastReadAt,
  initialReads,
  focusMessageId,
}: {
  conversationId: string;
  conversationName: string;
  conversationType: "CHANNEL" | "DM" | "GROUP";
  isAdmin: boolean;
  viewerId: string;
  viewerName: string;
  viewerAvatarUrl: string | null;
  members: { id: string; name: string; avatarUrl: string | null }[];
  initialMessages: MessageDTO[];
  initialHasOlder: boolean;
  initialHasNewer: boolean;
  initialLastReadAt: string | null;
  initialReads: { userId: string; lastReadAt: string }[];
  focusMessageId: string | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [showInfo, setShowInfo] = useState(false);
  const [messages, setMessages] = useState<MessageDTO[]>(initialMessages);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [hasNewer, setHasNewer] = useState(initialHasNewer);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<{ id: string; name: string }[]>([]);
  const [text, setText] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [atBottom, setAtBottom] = useState(!focusMessageId);
  const [newBelow, setNewBelow] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<MessageDTO | null>(null);
  // userId -> lastReadAt ISO, kept live from read events (seen-by receipts).
  const [reads, setReads] = useState<Map<string, string>>(
    () => new Map(initialReads.map((r) => [r.userId, r.lastReadAt])),
  );
  const [editTarget, setEditTarget] = useState<MessageDTO | null>(null);
  const [drafts, setDrafts] = useState<DraftAttachment[]>([]);
  const [pending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastTypingSent = useRef(0);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const hasNewerRef = useRef(initialHasNewer);
  hasNewerRef.current = hasNewer;
  const atBottomRef = useRef(atBottom);
  atBottomRef.current = atBottom;
  const loadingOlderRef = useRef(false);
  const loadingNewerRef = useRef(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set before prepending history so the layout effect can keep the viewport
  // anchored to the message the user was looking at.
  const scrollRestore = useRef<{ height: number; top: number } | null>(null);
  // Newest createdAt we already marked read, to avoid redundant round-trips.
  const lastMarkedAt = useRef<string>("");

  // The unread divider position is frozen at open: the first message from
  // someone else that is newer than the cursor the page loaded with. No
  // cursor means everything is unread (same rule as the unread pills).
  const unreadDividerId = useRef<string | null>(
    (() => {
      const cursor = initialLastReadAt ?? "";
      const first = initialMessages.find(
        (m) => m.author?.id !== viewerId && m.createdAt > cursor,
      );
      return first?.id ?? null;
    })(),
  ).current;

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

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const flashMessage = useCallback((id: string) => {
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }, []);

  /** Scroll to a message, fetching a window around it if it isn't loaded. */
  const jumpToMessage = useCallback(
    (messageId: string) => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        flashMessage(messageId);
        return;
      }
      aroundMessages(conversationId, messageId)
        .then((res) => {
          if (!res) return;
          setMessages(res.messages);
          setHasOlder(res.hasOlder);
          setHasNewer(res.hasNewer);
          setNewBelow(0);
          requestAnimationFrame(() => {
            document
              .getElementById(`msg-${messageId}`)
              ?.scrollIntoView({ block: "center" });
            flashMessage(messageId);
          });
        })
        .catch(() => {});
    },
    [conversationId, flashMessage],
  );

  /** Back to the live tail: newest page, scrolled to the bottom. */
  const jumpToLatest = useCallback(() => {
    recentMessages(conversationId)
      .then((fresh) => {
        setMessages(fresh);
        setHasOlder(true);
        setHasNewer(false);
        setNewBelow(0);
        requestAnimationFrame(scrollToBottom);
      })
      .catch(() => {});
  }, [conversationId, scrollToBottom]);

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
        case "message": {
          if (ev.conversationId !== conversationId) return;
          const incoming = ev.message;
          // Our own optimistic send coming back — drop the pending bubble.
          if (incoming.clientId) {
            setOutbox((prev) =>
              prev.filter((o) => o.clientId !== incoming.clientId),
            );
          }
          if (hasNewerRef.current) {
            // Viewing history — the message belongs below the loaded window.
            setNewBelow((n) => n + 1);
            return;
          }
          const stick = atBottomRef.current;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
          );
          if (stick) requestAnimationFrame(scrollToBottom);
          else if (incoming.author?.id !== viewerId) setNewBelow((n) => n + 1);
          break;
        }
        case "message-updated":
          if (ev.conversationId !== conversationId) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === ev.message.id ? ev.message : m)),
          );
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
        case "read":
          if (ev.conversationId !== conversationId) return;
          setReads((prev) => {
            const next = new Map(prev);
            next.set(ev.userId, ev.lastReadAt);
            return next;
          });
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
  }, [conversationId, conversationType, viewerId, router, scrollToBottom]);

  // Initial position: deep-linked message centered and highlighted, otherwise
  // the tail.
  useLayoutEffect(() => {
    if (focusMessageId) {
      document
        .getElementById(`msg-${focusMessageId}`)
        ?.scrollIntoView({ block: "center" });
      flashMessage(focusMessageId);
    } else {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Restore the anchor after prepending a history page.
  useLayoutEffect(() => {
    const restore = scrollRestore.current;
    const el = scrollRef.current;
    if (restore && el) {
      scrollRestore.current = null;
      el.scrollTop = el.scrollHeight - restore.height + restore.top;
    }
  }, [messages]);

  // Track whether the user is at the tail; leaving it stops auto-scroll and
  // read-marking until they return.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const near =
        el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_PX;
      setAtBottom(near);
      if (near && !hasNewerRef.current) setNewBelow(0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Mark read only when the user can actually see the tail: document visible,
  // scrolled to the bottom, not browsing history.
  useEffect(() => {
    if (!atBottom || hasNewer || messages.length === 0) return;
    if (document.visibilityState !== "visible") return;
    const newest = messages[messages.length - 1].createdAt;
    if (newest <= lastMarkedAt.current) return;
    lastMarkedAt.current = newest;
    markRead(conversationId);
  }, [messages, atBottom, hasNewer, conversationId]);

  // Load older history when the top sentinel becomes visible.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const scroller = scrollRef.current;
    if (!sentinel || !scroller || !hasOlder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loadingOlderRef.current) return;
        const oldest = messages[0];
        if (!oldest) return;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        olderMessages(conversationId, oldest.id)
          .then((res) => {
            if (res.messages.length) {
              scrollRestore.current = {
                height: scroller.scrollHeight,
                top: scroller.scrollTop,
              };
              setMessages((prev) => mergeMessages(res.messages, prev));
            }
            setHasOlder(res.hasMore);
          })
          .catch(() => {})
          .finally(() => {
            loadingOlderRef.current = false;
            setLoadingOlder(false);
          });
      },
      { root: scroller },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversationId, hasOlder, messages]);

  // While viewing history, scrolling to the loaded window's bottom pages
  // forward until we catch up with the live tail.
  useEffect(() => {
    if (!hasNewer || !atBottom || loadingNewerRef.current) return;
    const newest = messages[messages.length - 1];
    if (!newest) return;
    loadingNewerRef.current = true;
    newerMessages(conversationId, newest.id)
      .then((res) => {
        if (res.messages.length) {
          setMessages((prev) => mergeMessages(prev, res.messages));
        }
        setHasNewer(res.hasMore);
        if (!res.hasMore) setNewBelow(0);
      })
      .catch(() => {})
      .finally(() => {
        loadingNewerRef.current = false;
      });
  }, [conversationId, hasNewer, atBottom, messages]);

  // Mark read on open and stop typing timers on unmount.
  useEffect(() => {
    const timers = typingTimers.current;
    return () => {
      timers.forEach((t2) => clearTimeout(t2));
      timers.clear();
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  // Keep the tail pinned when the keyboard resizes the panel.
  useEffect(() => {
    if (atBottomRef.current && !hasNewerRef.current) scrollToBottom();
  }, [panelHeight, typing, scrollToBottom]);

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
  // messages that arrived meanwhile were missed. Refetch the latest and merge
  // (only in live-tail mode; a history view stays put).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (hasNewerRef.current) return;
      recentMessages(conversationId)
        .then((fresh) => {
          if (fresh.length) setMessages((prev) => mergeMessages(prev, fresh));
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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_DRAFTS - drafts.length;
    const files = [...list].slice(0, Math.max(0, room));
    for (const original of files) {
      const localId = crypto.randomUUID();
      setDrafts((prev) => [
        ...prev,
        {
          localId,
          name: original.name,
          isImage: original.type.startsWith("image/"),
          progress: 0,
          dto: null,
          failed: false,
        },
      ]);
      void (async () => {
        try {
          const file = await compressImage(original);
          const dto = await uploadAttachment(file, (fraction) => {
            setDrafts((prev) =>
              prev.map((d) =>
                d.localId === localId ? { ...d, progress: fraction } : d,
              ),
            );
          });
          setDrafts((prev) =>
            prev.map((d) =>
              d.localId === localId ? { ...d, dto, progress: 1 } : d,
            ),
          );
        } catch {
          setDrafts((prev) =>
            prev.map((d) =>
              d.localId === localId ? { ...d, failed: true } : d,
            ),
          );
        }
      })();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeDraft(localId: string) {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }

  const deliverSend = useCallback(
    (
      clientId: string,
      body: string,
      replyToId?: string,
      attachmentIds: string[] = [],
    ) => {
      sendMessage(conversationId, body, clientId, replyToId, attachmentIds)
        .then((res) => {
          if (res.error || !res.message) {
            setOutbox((prev) =>
              prev.map((o) =>
                o.clientId === clientId ? { ...o, failed: true } : o,
              ),
            );
            return;
          }
          const message = res.message;
          setOutbox((prev) => prev.filter((o) => o.clientId !== clientId));
          if (!hasNewerRef.current) {
            setMessages((prev) =>
              prev.some((m) => m.id === message.id) ? prev : [...prev, message],
            );
            requestAnimationFrame(scrollToBottom);
          }
        })
        .catch(() => {
          setOutbox((prev) =>
            prev.map((o) =>
              o.clientId === clientId ? { ...o, failed: true } : o,
            ),
          );
        });
    },
    [conversationId, scrollToBottom],
  );

  function send() {
    const body = text.trim();
    const readyAttachments = drafts
      .filter((d) => d.dto)
      .map((d) => d.dto!.id);
    if (!body && (editTarget || readyAttachments.length === 0)) return;
    // Wait for in-flight uploads before sending.
    if (!editTarget && drafts.some((d) => !d.dto && !d.failed)) return;
    setText("");
    // Reset the grown composer back to a single row.
    const el = textareaRef.current;
    if (el) el.style.height = "auto";

    if (editTarget) {
      // Edits update in place via the message-updated event — no bubble.
      const target = editTarget;
      setEditTarget(null);
      startTransition(async () => {
        await editMessage(target.id, body);
      });
      return;
    }

    const replyToId = replyTarget?.id;
    setReplyTarget(null);
    setDrafts([]);
    const clientId = crypto.randomUUID();
    setOutbox((prev) => [
      ...prev,
      {
        clientId,
        body,
        createdAt: new Date().toISOString(),
        failed: false,
        attachmentIds: readyAttachments,
        attachmentCount: readyAttachments.length,
      },
    ]);
    // Sending always returns you to the live tail.
    if (hasNewerRef.current) jumpToLatest();
    requestAnimationFrame(scrollToBottom);
    deliverSend(clientId, body, replyToId, readyAttachments);
  }

  function startReply(message: MessageDTO) {
    setEditTarget(null);
    setReplyTarget(message);
    textareaRef.current?.focus();
  }

  function startEdit(message: MessageDTO) {
    setReplyTarget(null);
    setEditTarget(message);
    setText(message.body);
    requestAnimationFrame(() => {
      autosizeComposer();
      textareaRef.current?.focus();
    });
  }

  function cancelComposerContext() {
    if (editTarget) setText("");
    setReplyTarget(null);
    setEditTarget(null);
  }

  function onDeleteMessage(messageId: string) {
    startTransition(async () => {
      await deleteMessage(messageId);
    });
  }

  function retrySend(item: OutboxItem) {
    setOutbox((prev) =>
      prev.map((o) =>
        o.clientId === item.clientId ? { ...o, failed: false } : o,
      ),
    );
    deliverSend(item.clientId, item.body, undefined, item.attachmentIds);
  }

  function discardSend(clientId: string) {
    setOutbox((prev) => prev.filter((o) => o.clientId !== clientId));
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

  // Where each other member's read cursor sits: their face goes under the
  // last loaded message at or before their cursor (only meaningful in live
  // mode with the tail loaded).
  const seenByMessage = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null }[]
  >();
  if (!hasNewer) {
    for (const member of members) {
      if (member.id === viewerId) continue;
      const cursor = reads.get(member.id);
      if (!cursor) continue;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].createdAt <= cursor) {
          const list = seenByMessage.get(messages[i].id) ?? [];
          list.push(member);
          seenByMessage.set(messages[i].id, list);
          break;
        }
      }
    }
  }
  // "Sendt" under the viewer's own newest message while nobody has seen it.
  const lastMessage = messages[messages.length - 1];
  const sentMarkerId =
    !hasNewer &&
    outbox.length === 0 &&
    lastMessage &&
    lastMessage.author?.id === viewerId &&
    !seenByMessage.has(lastMessage.id)
      ? lastMessage.id
      : null;

  const onlineOthers = online.filter((id) => id !== viewerId);
  const typingLabel =
    typing.length === 1
      ? t.chat.typingOne.replace("{name}", typing[0].name)
      : typing.length > 1
        ? t.chat.typingMany.replace("{count}", String(typing.length))
        : "";
  const showJumpPill = hasNewer || newBelow > 0 || !atBottom;

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

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="h-full space-y-4 overflow-y-auto py-4"
        >
          {hasOlder && (
            <div ref={topSentinelRef} className="py-1 text-center">
              <span className="text-xs text-zinc-500">
                {loadingOlder ? t.chat.loadingOlder : ""}
              </span>
            </div>
          )}
          {messages.length === 0 && outbox.length === 0 ? (
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
                  <div key={m.id} id={`msg-${m.id}`}>
                    {m.id === unreadDividerId && (
                      <div className="mb-4">
                        <UnreadDivider label={t.chat.newMessagesDivider} />
                      </div>
                    )}
                    <div
                      className={`rounded-xl transition-colors duration-700 ${
                        highlightId === m.id ? "bg-violet-500/15" : ""
                      }`}
                    >
                      <MessageItem
                        message={m}
                        viewerId={viewerId}
                        locale={locale}
                        onToggleReaction={onReact}
                        onVote={onVote}
                        onReply={startReply}
                        onEdit={startEdit}
                        onDelete={onDeleteMessage}
                        onJumpTo={jumpToMessage}
                      />
                    </div>
                    {seenByMessage.has(m.id) && (
                      <SeenBy members={seenByMessage.get(m.id)!} />
                    )}
                    {sentMarkerId === m.id && (
                      <p className="mt-0.5 pr-1 text-right text-[0.65rem] text-zinc-500">
                        {t.chat.sent}
                      </p>
                    )}
                  </div>
                ))}
              </section>
            ))
          )}

          {outbox.map((o) => (
            <div key={o.clientId} className="flex gap-2.5 opacity-80">
              <Avatar
                id={viewerId}
                name={viewerName}
                avatarUrl={viewerAvatarUrl}
                size="sm"
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-white">
                  {t.chat.you}
                </span>
                {o.body && (
                  <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">
                    {o.body}
                  </p>
                )}
                {o.attachmentCount > 0 && (
                  <p className="text-sm text-zinc-400">
                    📷 ×{o.attachmentCount}
                  </p>
                )}
                {o.failed ? (
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-red-400">
                    {t.chat.sendFailed}
                    <button
                      type="button"
                      onClick={() => retrySend(o)}
                      className="font-semibold underline underline-offset-2"
                    >
                      {t.chat.retry}
                    </button>
                    <button
                      type="button"
                      onClick={() => discardSend(o.clientId)}
                      className="text-zinc-400 underline underline-offset-2"
                    >
                      {t.chat.discard}
                    </button>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {t.chat.sending}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {showJumpPill && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-panel/95 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:border-white/25"
          >
            {newBelow > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500 px-1.5 text-[0.65rem]">
                {newBelow}
              </span>
            )}
            {t.chat.jumpToLatest} ↓
          </button>
        )}
      </div>

      <div className="min-h-[1.25rem] px-1 text-xs text-zinc-500">
        {typingLabel}
      </div>

      {(replyTarget || editTarget) && (
        <div className="mb-1 flex items-center gap-2 rounded-lg border-l-2 border-violet-400/60 bg-white/[0.04] px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-violet-300">
              {editTarget
                ? t.chat.editing
                : t.chat.replyingTo.replace(
                    "{name}",
                    replyTarget?.author?.name ?? t.chat.unknownAuthor,
                  )}
            </span>
            <span className="block truncate text-xs text-zinc-400">
              {(editTarget ?? replyTarget)?.body}
            </span>
          </div>
          <button
            type="button"
            onClick={cancelComposerContext}
            aria-label={t.common.cancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {showPoll ? (
        <PollComposer
          onCreate={onCreatePoll}
          onClose={() => setShowPoll(false)}
          pending={pending}
        />
      ) : (
        <div className="flex flex-col gap-1.5 pb-[env(safe-area-inset-bottom)]">
          {drafts.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-1 py-1">
              {drafts.map((d) => (
                <div
                  key={d.localId}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]"
                >
                  {d.dto?.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- auth-gated dynamic media route
                    <img
                      src={d.dto.thumbUrl}
                      alt={d.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-1 text-center text-[0.55rem] text-zinc-400">
                      {d.isImage ? "🖼️" : d.name}
                    </span>
                  )}
                  {!d.dto && !d.failed && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                      <span
                        className="block h-full bg-violet-400 transition-[width]"
                        style={{ width: `${Math.round(d.progress * 100)}%` }}
                      />
                    </span>
                  )}
                  {d.failed && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[0.55rem] text-red-300">
                      {t.chat.uploadFailed}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeDraft(d.localId)}
                    aria-label={t.chat.removeAttachment}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[0.6rem] text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t.chat.attachImage}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-lg text-zinc-300 transition hover:border-white/20"
          >
            📎
          </button>
          <button
            type="button"
            onClick={() => setShowPoll(true)}
            aria-label={t.chat.newPoll}
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-lg text-zinc-300 transition hover:border-white/20 sm:flex"
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
            disabled={
              (!text.trim() && !drafts.some((d) => d.dto)) ||
              drafts.some((d) => !d.dto && !d.failed)
            }
            className={`${btnPrimary} h-11 shrink-0`}
          >
            {t.chat.send}
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
