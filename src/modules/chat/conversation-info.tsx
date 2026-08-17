"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { btnDangerOutline, btnPrimary, btnSecondary, errorText, input } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import {
  addMembers,
  leaveGroup,
  removeMember,
  renameGroup,
} from "./conversation-actions";
import { addableMembers } from "./actions";

type Member = { id: string; name: string; avatarUrl: string | null };

/**
 * Members/details sheet for a conversation, opened from the header. Mobile
 * gets a full-screen overlay (no hover, big tap targets); desktop a centered
 * panel. Group admins can rename, add and remove; any member can leave.
 */
export function ConversationInfo({
  conversationId,
  conversationType,
  conversationName,
  members,
  online,
  viewerId,
  isAdmin,
  onClose,
}: {
  conversationId: string;
  conversationType: "CHANNEL" | "DM" | "GROUP";
  conversationName: string;
  members: Member[];
  online: string[];
  viewerId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(conversationName);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<Member[] | null>(null);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());

  const isGroup = conversationType === "GROUP";
  const onlineSet = new Set(online);

  // Load addable members once the picker opens.
  useEffect(() => {
    if (!adding || candidates !== null) return;
    addableMembers(conversationId).then(setCandidates).catch(() => {});
  }, [adding, candidates, conversationId]);

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      else {
        setError(undefined);
        after?.();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={conversationName}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-md md:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-lg font-semibold text-white">
            {conversationName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.cancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {isGroup && isAdmin && (
          <div className="mb-4">
            {renaming ? (
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                  className={input}
                />
                <button
                  type="button"
                  disabled={pending || !newName.trim()}
                  onClick={() =>
                    run(
                      () => renameGroup(conversationId, newName),
                      () => {
                        setRenaming(false);
                        router.refresh();
                      },
                    )
                  }
                  className={btnPrimary}
                >
                  {t.common.save}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className={btnSecondary}
              >
                {t.chat.renameGroup}
              </button>
            )}
          </div>
        )}

        <h3 className="mb-2 text-sm font-semibold text-zinc-400">
          {t.chat.members} · {members.length}
        </h3>
        <ul className="mb-4 space-y-1">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg p-2">
              <div className="relative">
                <Avatar id={m.id} name={m.name} avatarUrl={m.avatarUrl} size="sm" />
                {onlineSet.has(m.id) && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-emerald-400"
                  />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                {m.id === viewerId ? t.chat.you : m.name}
              </span>
              {isGroup && isAdmin && m.id !== viewerId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => removeMember(conversationId, m.id),
                      () => router.refresh(),
                    )
                  }
                  className="shrink-0 text-xs text-zinc-500 transition hover:text-red-400"
                >
                  {t.chat.removeMember}
                </button>
              )}
            </li>
          ))}
        </ul>

        {isGroup && isAdmin && (
          <div className="mb-4">
            {adding ? (
              <div className="space-y-2">
                {candidates === null ? (
                  <p className="text-sm text-zinc-500">{t.common.loading}</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t.chat.noMembersFound}</p>
                ) : (
                  candidates.map((c) => {
                    const checked = toAdd.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() =>
                          setToAdd((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/[0.05]"
                      >
                        <Avatar id={c.id} name={c.name} avatarUrl={c.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                          {c.name}
                        </span>
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6rem] ${
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
                <button
                  type="button"
                  disabled={pending || toAdd.size === 0}
                  onClick={() =>
                    run(
                      () => addMembers(conversationId, [...toAdd]),
                      () => {
                        setAdding(false);
                        setToAdd(new Set());
                        setCandidates(null);
                        router.refresh();
                      },
                    )
                  }
                  className={`${btnPrimary} w-full`}
                >
                  {t.chat.addMembers}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={btnSecondary}
              >
                {t.chat.addMembers}
              </button>
            )}
          </div>
        )}

        {error && (
          <p className={errorText} role="alert">
            {error}
          </p>
        )}

        {isGroup && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => leaveGroup(conversationId),
                () => router.push("/chat"),
              )
            }
            className={btnDangerOutline}
          >
            {t.chat.leaveGroup}
          </button>
        )}
      </div>
    </div>
  );
}
