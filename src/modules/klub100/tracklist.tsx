"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { emptyBox, errorText, linkDanger, listCard } from "@/components/ui";
import { ChevronDownIcon, ChevronUpIcon, HeartIcon } from "@/components/icons";
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
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result?.error);
    });

  if (songs.length === 0) {
    return <p className={emptyBox}>{t.klub100.emptyTracklist}</p>;
  }

  return (
    <div>
      {error && (
        <p className={`${errorText} mb-2`} role="alert">
          {error}
        </p>
      )}
      <ol className={listCard}>
        {songs.map((song) => {
          const canEdit = isCurator || song.suggestedById === currentUserId;
          return (
            <li key={song.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-right font-mono text-sm text-fuchsia-300/80">
                  {song.position}
                </span>
                <SongMeta song={song} />
                {isCurator && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      disabled={isPending || song.position === 1}
                      onClick={() =>
                        run(() => moveSong(song.id, song.position! - 1))
                      }
                      aria-label={t.klub100.moveUp}
                      className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border border-white/15 text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      <ChevronUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={isPending || song.position === songs.length}
                      onClick={() =>
                        run(() => moveSong(song.id, song.position! + 1))
                      }
                      aria-label={t.klub100.moveDown}
                      className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border border-white/15 text-zinc-300 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      <ChevronDownIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-11">
                <CheersCell song={song} canEdit={canEdit} />
                {canEdit && <EditSongButton song={song} />}
                <span className="flex-1" />
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                  <HeartIcon className="h-3.5 w-3.5" filled />
                  {song.voteCount}
                </span>
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
                      className={`${linkDanger} text-xs`}
                    >
                      {t.klub100.backToPool}
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
  const { t } = useI18n();
  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      {t.klub100.toPosition}
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
        className="w-14 rounded-lg border border-white/15 bg-white/[0.06] px-1.5 py-1.5 text-center text-xs text-zinc-100"
      />
    </label>
  );
}
