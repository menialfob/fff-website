"use client";

import { useState, useTransition } from "react";
import { moveSong, restoreSong } from "./actions";
import { EditSongButton } from "./edit-song";
import { CheersCell, SongMeta } from "./song-bits";
import type { SongView } from "./shared";

export function Tracklist({
  songs,
  isCurator,
  currentUserId,
}: {
  songs: SongView[]; // accepted, sorted by position
  isCurator: boolean;
  currentUserId: string;
}) {
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.error);
    });

  if (songs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-500">
        No songs on the tracklist yet — accept suggestions from the pool below.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <ol className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
        {songs.map((song) => {
          const canEdit = isCurator || song.suggestedById === currentUserId;
          return (
          <li key={song.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-right font-mono text-sm text-stone-500">
                {song.position}
              </span>
              <SongMeta song={song} />
              {isCurator && (
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={isPending || song.position === 1}
                    onClick={() => run(() => moveSong(song.id, song.position! - 1))}
                    aria-label="Move up"
                    className="min-h-9 min-w-9 rounded-md border border-stone-300 text-sm hover:bg-stone-100 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={isPending || song.position === songs.length}
                    onClick={() => run(() => moveSong(song.id, song.position! + 1))}
                    aria-label="Move down"
                    className="min-h-9 min-w-9 rounded-md border border-stone-300 text-sm hover:bg-stone-100 disabled:opacity-40"
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-11">
              <CheersCell song={song} canEdit={canEdit} />
              {canEdit && <EditSongButton song={song} />}
              <span className="flex-1" />
              <span className="text-xs text-stone-500">♥ {song.voteCount}</span>
              {isCurator && (
                <>
                  <PositionInput
                    position={song.position!}
                    max={songs.length}
                    disabled={isPending}
                    onMove={(to) => run(() => moveSong(song.id, to))}
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => restoreSong(song.id))}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Back to pool
                  </button>
                </>
              )}
            </div>
          </li>
          );
        })}
      </ol>
    </div>
  );
}

/** "Move to position …" — commit on blur or Enter. */
function PositionInput({
  position,
  max,
  disabled,
  onMove,
}: {
  position: number;
  max: number;
  disabled: boolean;
  onMove: (to: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-stone-500">
      to #
      <input
        key={position}
        type="number"
        min={1}
        max={max}
        defaultValue={position}
        disabled={disabled}
        onBlur={(e) => {
          const to = parseInt(e.target.value, 10);
          if (!Number.isNaN(to) && to !== position) onMove(to);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-14 rounded-md border border-stone-300 px-1.5 py-1.5 text-center text-xs"
      />
    </label>
  );
}
