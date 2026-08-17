"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { btnPrimary, errorText, input, listCard } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { createDm, createGroup } from "./conversation-actions";

type Member = { id: string; name: string; avatarUrl: string | null };

/**
 * Member picker for starting a conversation: one selected member starts (or
 * reopens) a DM, several become a named group — the Messenger flow.
 */
export function NewConversation({ members }: { members: Member[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q
      ? members.filter((m) => m.name.toLocaleLowerCase().includes(q))
      : members;
  }, [members, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res =
        ids.length === 1
          ? await createDm(ids[0])
          : await createGroup(groupName, ids);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.conversationId) router.push(`/chat/${res.conversationId}`);
    });
  }

  const isGroup = selected.size > 1;
  const canStart =
    selected.size > 0 && !pending && (!isGroup || groupName.trim().length > 0);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.chat.searchMembers}
        className={input}
        autoComplete="off"
      />

      <div className={listCard}>
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">{t.chat.noMembersFound}</p>
        ) : (
          filtered.map((m) => {
            const checked = selected.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                aria-pressed={checked}
                className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/[0.03]"
              >
                <Avatar id={m.id} name={m.name} avatarUrl={m.avatarUrl} size="md" />
                <span className="min-w-0 flex-1 truncate font-medium text-white">
                  {m.name}
                </span>
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition ${
                    checked
                      ? "border-violet-400 bg-violet-500 text-white"
                      : "border-white/20 text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })
        )}
      </div>

      {isGroup && (
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder={t.chat.groupName}
          maxLength={100}
          className={input}
        />
      )}

      {error && (
        <p className={errorText} role="alert">
          {error}
        </p>
      )}

      {/* Sticky action so the button stays reachable above the tab bar while
          scrolling a long member list on a phone. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:static md:bottom-auto">
        <button
          type="button"
          onClick={start}
          disabled={!canStart}
          className={`${btnPrimary} w-full`}
        >
          {isGroup
            ? t.chat.createGroup
            : selected.size === 1
              ? t.chat.startDm
              : t.chat.selectMembers}
        </button>
      </div>
    </div>
  );
}
