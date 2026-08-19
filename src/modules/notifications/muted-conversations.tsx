"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { errorText } from "@/components/ui";
import { BellIcon } from "@/components/icons";
import { setConversationMuted } from "@/modules/chat/actions";

export type MutedConversation = { id: string; slug: string; title: string };

/**
 * The muted conversations under the notification toggles in the profile.
 *
 * Muting itself belongs in the chat — that is where the wish to silence
 * something arises — so this list only reviews and undoes, which is the half a
 * member cannot do from the chat: finding the conversation they silenced
 * months ago means remembering which one it was.
 *
 * Unmuting drops the row immediately rather than flipping it in place. The
 * server action re-renders this page with the shorter list a moment later
 * either way, so removing it up front is both the honest reading of "muted
 * conversations" and the version without a flicker.
 */
export function MutedConversations({
  initial,
}: {
  initial: MutedConversation[];
}) {
  const { t } = useI18n();
  const n = t.profile.notifications;
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = initial.filter((c) => !removed.has(c.id));

  function unmute(id: string) {
    setRemoved((current) => new Set(current).add(id));
    setError(null);
    startTransition(async () => {
      const result = await setConversationMuted(id, false).catch(() => ({
        error: n.prefsFailed,
      }));
      if (result?.error) {
        // Put it back: the conversation is still muted.
        setRemoved((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-200">{n.mutedTitle}</p>
      <p className="text-sm text-zinc-400">
        {visible.length > 0 ? n.mutedHint : n.mutedNone}
      </p>

      {visible.length > 0 && (
        <ul className="divide-y divide-white/[0.06]">
          {visible.map((conversation) => (
            <li
              key={conversation.id}
              className="flex min-h-12 items-center justify-between gap-3 py-1.5"
            >
              <Link
                href={`/chat/${conversation.slug}`}
                className="min-w-0 flex-1 truncate py-2 text-sm text-zinc-200 hover:text-white"
              >
                {conversation.title}
              </Link>
              <button
                type="button"
                onClick={() => unmute(conversation.id)}
                className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]"
              >
                <BellIcon className="h-4 w-4" />
                {t.chat.unmute}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
