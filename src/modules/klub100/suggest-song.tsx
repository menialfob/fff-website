"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, useTransition } from "react";
import { attachCheers, suggestSong } from "./actions";
import { searchSongs, type SearchResult } from "./search-actions";
import { CheersCapture } from "./cheers-recorder";
import { SegmentPicker, type Segment } from "./segment-picker";
import { formatMs, placementLabels, type Placement } from "./shared";

const DEFAULT_SEGMENT_MS = 60_000;

export function SuggestSongButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        + Suggest a song
      </button>
      {open && (
        <SuggestSongDialog projectId={projectId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function SuggestSongDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [track, setTrack] = useState<SearchResult | null>(null);
  const [seg1, setSeg1] = useState<Segment>({ startMs: 0, endMs: DEFAULT_SEGMENT_MS });
  const [seg2, setSeg2] = useState<Segment | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [note, setNote] = useState("");
  const [cheersFile, setCheersFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  // Bumped on every search so out-of-order responses from earlier keystrokes
  // can be discarded — only the latest request gets to set state.
  const searchSeq = useRef(0);

  // Spotify-style live search: debounce the query and search as the user
  // types, instead of waiting for a button press.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      searchSeq.current += 1; // invalidate any in-flight request
      setResults([]);
      setSearched(false);
      setError(undefined);
      return;
    }

    const timer = setTimeout(() => {
      const seq = ++searchSeq.current;
      startTransition(async () => {
        const result = await searchSongs(projectId, trimmed);
        if (seq !== searchSeq.current) return; // a newer search superseded us
        setError(result.error);
        setResults(result.tracks ?? []);
        setSearched(true);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, projectId]);

  const selectTrack = (t: SearchResult) => {
    setTrack(t);
    setError(undefined);
    // Default window: a minute starting a third in — usually near the chorus.
    const start = Math.max(
      0,
      Math.min(Math.round(t.durationMs / 3), t.durationMs - DEFAULT_SEGMENT_MS),
    );
    setSeg1({ startMs: start, endMs: Math.min(start + DEFAULT_SEGMENT_MS, t.durationMs) });
    setSeg2(null);
  };

  const submit = () => {
    if (!track) return;
    startTransition(async () => {
      const result = await suggestSong({
        projectId,
        spotifyTrackId: track.id,
        spotifyUrl: track.spotifyUrl,
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationMs: track.durationMs,
        albumArtUrl: track.albumArtUrl,
        seg1StartMs: seg1.startMs,
        seg1EndMs: seg1.endMs,
        seg2StartMs: seg2?.startMs ?? null,
        seg2EndMs: seg2?.endMs ?? null,
        placement,
        placementNote: note || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.ok && result.songId && cheersFile) {
        const formData = new FormData();
        formData.set("songId", result.songId);
        formData.set("file", cheersFile);
        const cheersResult = await attachCheers(formData);
        if (cheersResult?.error) {
          // The song is saved; surface the cheers problem instead of closing.
          setError(`Song suggested, but the cheers failed: ${cheersResult.error}`);
          setCheersFile(null);
          return;
        }
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h3 className="text-lg font-semibold">
            {track ? "Pick the best minute" : "Suggest a song"}
          </h3>
          <button
            type="button"
            onClick={track ? () => setTrack(null) : onClose}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            {track ? "← Back" : "Close"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!track ? (
            <>
              <div className="relative">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Spotify — song or artist"
                  autoFocus
                  className="w-full rounded-md border border-stone-300 px-3 py-2.5 pr-10 text-base sm:text-sm"
                />
                {isPending && (
                  <span
                    aria-hidden
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700"
                  />
                )}
              </div>
              {error && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <ul className="mt-4 divide-y divide-stone-100">
                {results.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={!!t.alreadySuggestedBy}
                      onClick={() => selectTrack(t)}
                      className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-stone-50 disabled:opacity-50"
                    >
                      {t.albumArtUrl && (
                        <img
                          src={t.albumArtUrl}
                          alt=""
                          className="h-12 w-12 rounded-md object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="block truncate text-sm text-stone-500">
                          {t.artist} · {formatMs(t.durationMs)}
                          {t.alreadySuggestedBy &&
                            ` · already suggested by ${t.alreadySuggestedBy}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {searched && !isPending && query.trim() && results.length === 0 && !error && (
                  <li className="py-4 text-sm text-stone-500">No tracks found.</li>
                )}
              </ul>
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                {track.albumArtUrl && (
                  <img
                    src={track.albumArtUrl}
                    alt=""
                    className="h-14 w-14 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{track.title}</p>
                  <p className="truncate text-sm text-stone-500">
                    {track.artist} · {formatMs(track.durationMs)}
                  </p>
                </div>
                <a
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100"
                >
                  Open in Spotify ↗
                </a>
              </div>

              <p className="text-sm text-stone-600">
                Listen in Spotify and drag the window to the best part of the
                song (~1 minute).
              </p>
              <SegmentPicker
                durationMs={track.durationMs}
                seg1={seg1}
                seg2={seg2}
                onChange={(s1, s2) => {
                  setSeg1(s1);
                  setSeg2(s2);
                }}
              />

              <div>
                <p className="mb-2 text-sm font-medium">
                  Where does it belong in the mix?
                </p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(placementLabels) as Placement[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlacement(placement === p ? null : p)}
                      className={`rounded-full border px-4 py-2 text-sm ${
                        placement === p
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-300 hover:bg-stone-100"
                      }`}
                    >
                      {placementLabels[p]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="Optional note — “late song for when people are hyped”"
                  className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2.5 text-base sm:text-sm"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">
                  Cheers recording <span className="font-normal text-stone-500">(optional — can be added later)</span>
                </p>
                <CheersCapture value={cheersFile} onChange={setCheersFile} />
              </div>

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {track && (
          <div className="border-t border-stone-200 p-4">
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="w-full rounded-md bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {isPending ? "Suggesting…" : "Suggest this song"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
