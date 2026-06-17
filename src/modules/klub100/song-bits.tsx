"use client";

/* eslint-disable @next/next/no-img-element */

import { placementLabels, segmentLabel, type SongView } from "./shared";
import { CheersButton } from "./cheers-recorder";

export function PlacementBadge({ song }: { song: SongView }) {
  if (!song.placement) return null;
  const colors = {
    EARLY: "bg-sky-100 text-sky-800",
    MIDDLE: "bg-amber-100 text-amber-800",
    LATE: "bg-rose-100 text-rose-800",
  } as const;
  return (
    <span
      title={song.placementNote ?? undefined}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[song.placement]}`}
    >
      {placementLabels[song.placement]}
      {song.placementNote && " *"}
    </span>
  );
}

/** Album art, title/artist, segment + placement metadata. */
export function SongMeta({ song }: { song: SongView }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {song.albumArtUrl && (
        <img
          src={song.albumArtUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={song.spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium hover:underline"
        >
          {song.title}
        </a>
        <p className="truncate text-sm text-stone-500">{song.artist}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500">
          <span>▶ {segmentLabel(song)}</span>
          <PlacementBadge song={song} />
          <span>by {song.suggestedByName}</span>
        </p>
        {song.placementNote && (
          <p className="truncate text-xs italic text-stone-500">
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
