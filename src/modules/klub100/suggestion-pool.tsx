"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { chip, emptyBox, errorText, linkDanger, listCard } from "@/components/ui";
import { CheckIcon, HeartIcon, XIcon } from "@/components/icons";
import {
  acceptSong,
  deleteSuggestion,
  rejectSong,
  restoreSong,
  toggleVote,
} from "./actions";
import { EditSongButton } from "./edit-song";
import { CheersCell, SongMeta } from "./song-bits";
import { placements, type Placement, type SongView } from "./shared";

type Filter = "ALL" | Placement;

export function SuggestionPool({
  suggested,
  rejected,
  isCurator,
  currentUserId,
}: {
  suggested: SongView[]; // sorted by votes desc, then newest
  rejected: SongView[];
  isCurator: boolean;
  currentUserId: string;
}) {
  const { t, fmt } = useI18n();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.error);
    });

  const visible =
    filter === "ALL"
      ? suggested
      : suggested.filter((s) => s.placement === filter);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["ALL", ...placements] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={chip(filter === f)}
          >
            {f === "ALL" ? t.klub100.filterAll : t.klub100.placements[f]}
          </button>
        ))}
      </div>
      {error && (
        <p className={`${errorText} mb-2`} role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className={emptyBox}>
          {suggested.length === 0
            ? t.klub100.noSuggestions
            : t.klub100.noFilterMatches}
        </p>
      ) : (
        <ul className={listCard}>
          {visible.map((song) => {
            const canEdit = isCurator || song.suggestedById === currentUserId;
            return (
              <li key={song.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <SongMeta song={song} />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => toggleVote(song.id))}
                    className={`flex min-h-11 min-w-11 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border text-sm transition ${
                      song.votedByMe
                        ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-300"
                        : "border-white/15 text-zinc-400 hover:bg-white/10"
                    }`}
                    aria-label={
                      song.votedByMe ? t.klub100.removeVote : t.klub100.vote
                    }
                  >
                    <HeartIcon className="h-4 w-4" filled={song.votedByMe} />
                    <span className="text-xs">{song.voteCount}</span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CheersCell song={song} canEdit={canEdit} />
                  {canEdit && <EditSongButton song={song} />}
                  <span className="flex-1" />
                  {isCurator && (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => acceptSong(song.id))}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:brightness-110 disabled:opacity-50"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        {t.klub100.accept}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => rejectSong(song.id))}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        {t.klub100.reject}
                      </button>
                    </>
                  )}
                  {song.suggestedById === currentUserId && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (!confirm(t.klub100.confirmRemoveSuggestion)) return;
                        run(() => deleteSuggestion(song.id));
                      }}
                      className={`${linkDanger} text-xs`}
                    >
                      {t.common.delete}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rejected.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-300">
            {fmt(t.klub100.rejected, { count: rejected.length })}
          </summary>
          <ul className={`${listCard} mt-2 opacity-70`}>
            {rejected.map((song) => (
              <li key={song.id} className="flex items-center gap-3 px-4 py-3">
                <SongMeta song={song} />
                {isCurator && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => restoreSong(song.id))}
                    className="shrink-0 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 hover:underline disabled:opacity-50"
                  >
                    {t.common.restore}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
