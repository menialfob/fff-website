"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import type { RealtimeEvent } from "@/lib/realtime";
import type { ConversationSummaryDTO } from "./data";
import { listConversationSummaries } from "./actions";
import { Avatar } from "@/components/avatar";

/**
 * Live conversation index: renders the server-provided summaries and keeps
 * them current from the SSE stream — new messages update previews/unread and
 * re-sort, membership events refetch the list.
 */
export function ConversationList({
  initial,
  viewerId,
}: {
  initial: ConversationSummaryDTO[];
  viewerId: string;
}) {
  const { t } = useI18n();
  const [summaries, setSummaries] = useState(initial);
  // One refetch at a time; events arriving mid-flight queue a trailing one.
  const refetching = useRef(false);
  const refetchQueued = useRef(false);

  useEffect(() => {
    const refetch = () => {
      if (refetching.current) {
        refetchQueued.current = true;
        return;
      }
      refetching.current = true;
      listConversationSummaries()
        .then(setSummaries)
        .catch(() => {})
        .finally(() => {
          refetching.current = false;
          if (refetchQueued.current) {
            refetchQueued.current = false;
            refetch();
          }
        });
    };

    const es = new EventSource("/api/chat/stream");
    es.onmessage = (e) => {
      let ev: RealtimeEvent;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      if (ev.type === "message") {
        const { conversationId, message } = ev;
        setSummaries((prev) => {
          const idx = prev.findIndex((s) => s.id === conversationId);
          // A message in a conversation we don't know yet (e.g. first message
          // of a new DM) — pull the full list.
          if (idx === -1) {
            refetch();
            return prev;
          }
          const updated: ConversationSummaryDTO = {
            ...prev[idx],
            unread:
              message.author?.id === viewerId
                ? prev[idx].unread
                : prev[idx].unread + 1,
            lastMessageAt: message.createdAt,
            last: {
              authorName: message.author?.name ?? null,
              preview: message.poll ? `📊 ${message.poll.question}` : message.body,
              createdAt: message.createdAt,
            },
          };
          const next = [...prev];
          next[idx] = updated;
          // Channels stay pinned in place; DMs/groups bubble to the top of
          // the non-channel block.
          if (updated.type !== "CHANNEL") {
            next.splice(idx, 1);
            const firstNonChannel = next.findIndex((s) => s.type !== "CHANNEL");
            next.splice(
              firstNonChannel === -1 ? next.length : firstNonChannel,
              0,
              updated,
            );
          }
          return next;
        });
      } else if (ev.type === "conversation") {
        refetch();
      }
    };
    // Coming back to the foreground: the stream was suspended, counts may be
    // stale.
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [viewerId]);

  if (summaries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        {t.chat.noConversations}
      </p>
    );
  }

  return (
    <>
      {summaries.map((s) => (
        <Link
          key={s.id}
          href={`/chat/${s.slug}`}
          className="flex items-center gap-3 p-4 transition hover:bg-white/[0.03]"
        >
          <Avatar
            id={s.avatar?.id ?? s.id}
            name={s.avatar?.name ?? s.title}
            avatarUrl={s.avatar?.avatarUrl ?? null}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-white">
                {s.title}
              </span>
              {s.muted && (
                <span aria-label={t.chat.muted} title={t.chat.muted} className="shrink-0 text-xs">
                  🔕
                </span>
              )}
              {s.unread > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {s.unread}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-zinc-400">
              {s.last
                ? `${s.last.authorName ? `${s.last.authorName}: ` : ""}${s.last.preview}`
                : t.chat.noMessagesYet}
            </p>
          </div>
        </Link>
      ))}
    </>
  );
}
