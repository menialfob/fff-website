"use client";

import { useState, useTransition } from "react";
import {
  acceptSong,
  deleteSuggestion,
  rejectSong,
  restoreSong,
  toggleVote,
} from "./actions";
import { CheersCell, SongMeta } from "./song-bits";
import { placementLabels, type Placement, type SongView } from "./shared";

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
  const [filter, setFilter] = useState<Filter>("ALL");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.error);
    });

  const visible =
    filter === "ALL" ? suggested : suggested.filter((s) => s.placement === filter);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["ALL", "EARLY", "MIDDLE", "LATE"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filter === f
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 hover:bg-stone-100"
            }`}
          >
            {f === "ALL" ? "All" : placementLabels[f]}
          </button>
        ))}
      </div>
      {error && (
        <p className="mb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-500">
          {suggested.length === 0
            ? "No suggestions yet — be the first!"
            : "No suggestions match this filter."}
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
          {visible.map((song) => (
            <li key={song.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <SongMeta song={song} />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => toggleVote(song.id))}
                  className={`flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-sm ${
                    song.votedByMe
                      ? "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-stone-300 hover:bg-stone-100"
                  }`}
                  aria-label={song.votedByMe ? "Remove vote" : "Vote"}
                >
                  <span>{song.votedByMe ? "♥" : "♡"}</span>
                  <span className="text-xs">{song.voteCount}</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CheersCell song={song} />
                <span className="flex-1" />
                {isCurator && (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => acceptSong(song.id))}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      ✓ Accept
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => rejectSong(song.id))}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {song.suggestedById === currentUserId && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (!confirm("Remove your suggestion?")) return;
                      run(() => deleteSuggestion(song.id));
                    }}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejected.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-stone-500">
            Rejected ({rejected.length})
          </summary>
          <ul className="mt-2 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white opacity-70 shadow-sm">
            {rejected.map((song) => (
              <li key={song.id} className="flex items-center gap-3 px-4 py-3">
                <SongMeta song={song} />
                {isCurator && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => restoreSong(song.id))}
                    className="shrink-0 text-xs text-stone-600 hover:underline disabled:opacity-50"
                  >
                    Restore
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
