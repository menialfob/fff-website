"use client";

/* eslint-disable @next/next/no-img-element */

import { useI18n } from "@/lib/i18n/client";
import { PlayIcon } from "@/components/icons";
import { segmentLabel, type SongView } from "./shared";
import { CheersButton } from "./cheers-recorder";

export function PlacementBadge({ song }: { song: SongView }) {
  const { t } = useI18n();
  if (!song.placement) return null;
  const colors = {
    EARLY: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    MIDDLE: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    LATE: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  } as const;
  return (
    <span
      title={song.placementNote ?? undefined}
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${colors[song.placement]}`}
    >
      {t.klub100.placements[song.placement]}
      {song.placementNote && " *"}
    </span>
  );
}

/** Album art, title/artist, segment + placement metadata. */
export function SongMeta({ song }: { song: SongView }) {
  const { t, fmt } = useI18n();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {song.albumArtUrl && (
        <img
          src={song.albumArtUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-md shadow-black/30"
        />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={song.spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium text-zinc-100 hover:text-fuchsia-300 hover:underline"
        >
          {song.title}
        </a>
        <p className="truncate text-sm text-zinc-500">{song.artist}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <PlayIcon className="h-3 w-3" />
            {segmentLabel(song)}
          </span>
          <PlacementBadge song={song} />
          <span>{fmt(t.klub100.suggestedBy, { name: song.suggestedByName })}</span>
        </p>
        {song.placementNote && (
          <p className="truncate text-xs italic text-zinc-500">
            “{song.placementNote}”
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Cheers player when present, plus add/replace controls for editors. Everyone
 * can listen; only the suggestor or a curator (`canEdit`) can change the clip.
 */
export function CheersCell({
  song,
  canEdit,
}: {
  song: SongView;
  canEdit: boolean;
}) {
  if (!song.hasCheers && !canEdit) return null;
  return (
    <div className="flex items-center gap-2">
      {song.hasCheers && (
        <audio
          src={`/api/klub100/cheers/${song.id}`}
          controls
          preload="none"
          className="h-9 w-44 max-w-full"
        />
      )}
      {canEdit && (
        <CheersButton
          songId={song.id}
          songTitle={song.title}
          hasCheers={song.hasCheers}
        />
      )}
    </div>
  );
}
