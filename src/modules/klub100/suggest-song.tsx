"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import {
  btnPrimary,
  btnSecondary,
  chip,
  errorText,
  input,
} from "@/components/ui";
import { ExternalLinkIcon, PlusIcon } from "@/components/icons";
import { attachCheers, suggestSong } from "./actions";
import { searchSongs, type SearchResult } from "./search-actions";
import { CheersCapture } from "./cheers-recorder";
import { SegmentPicker, type Segment } from "./segment-picker";
import { formatMs, placements, type Placement } from "./shared";

const DEFAULT_SEGMENT_MS = 60_000;

export function SuggestSongButton({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnPrimary}
      >
        <PlusIcon className="h-4 w-4" />
        {t.klub100.suggestSong}
      </button>
      {open && (
        <SuggestSongDialog
          projectId={projectId}
          onClose={() => setOpen(false)}
        />
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
  const { t, fmt } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [track, setTrack] = useState<SearchResult | null>(null);
  const [seg1, setSeg1] = useState<Segment>({
    startMs: 0,
    endMs: DEFAULT_SEGMENT_MS,
  });
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

  const selectTrack = (tr: SearchResult) => {
    setTrack(tr);
    setError(undefined);
    // Default window: a minute starting a third in — usually near the chorus.
    const start = Math.max(
      0,
      Math.min(Math.round(tr.durationMs / 3), tr.durationMs - DEFAULT_SEGMENT_MS),
    );
    setSeg1({
      startMs: start,
      endMs: Math.min(start + DEFAULT_SEGMENT_MS, tr.durationMs),
    });
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
          setError(
            fmt(t.klub100.songSavedCheersFailed, { error: cheersResult.error }),
          );
          setCheersFile(null);
          return;
        }
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col bg-panel sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-lg font-semibold text-white">
            {track ? t.klub100.pickBestMinute : t.klub100.suggestSong}
          </h3>
          <button
            type="button"
            onClick={track ? () => setTrack(null) : onClose}
            className={`${btnSecondary} min-h-9 px-3 py-1.5`}
          >
            {track ? t.common.back : t.common.close}
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
                  placeholder={t.klub100.searchPlaceholder}
                  autoFocus
                  className={`${input} mt-0 pr-10`}
                />
                {isPending && (
                  <span
                    aria-hidden
                    className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-amber-400"
                  />
                )}
              </div>
              {error && (
                <p className={`${errorText} mt-3`} role="alert">
                  {error}
                </p>
              )}
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {results.map((tr) => (
                  <li key={tr.id}>
                    <button
                      type="button"
                      disabled={!!tr.alreadySuggestedBy}
                      onClick={() => selectTrack(tr)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-white/5 disabled:opacity-50"
                    >
                      {tr.albumArtUrl && (
                        <img
                          src={tr.albumArtUrl}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-100">
                          {tr.title}
                        </span>
                        <span className="block truncate text-sm text-zinc-500">
                          {tr.artist} · {formatMs(tr.durationMs)}
                          {tr.alreadySuggestedBy &&
                            ` · ${fmt(t.klub100.alreadySuggestedBy, { name: tr.alreadySuggestedBy })}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {searched &&
                  !isPending &&
                  query.trim() &&
                  results.length === 0 &&
                  !error && (
                    <li className="py-4 text-sm text-zinc-500">
                      {t.klub100.noTracksFound}
                    </li>
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
                    className="h-14 w-14 rounded-lg object-cover shadow-md shadow-black/30"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-100">
                    {track.title}
                  </p>
                  <p className="truncate text-sm text-zinc-500">
                    {track.artist} · {formatMs(track.durationMs)}
                  </p>
                </div>
                <a
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnSecondary} shrink-0 px-3 py-2`}
                >
                  {t.klub100.openInSpotify}
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </div>

              <p className="text-sm text-zinc-400">{t.klub100.dragHint}</p>
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
                <p className="mb-2 text-sm font-medium text-zinc-200">
                  {t.klub100.whereInMix}
                </p>
                <div className="flex flex-wrap gap-2">
                  {placements.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlacement(placement === p ? null : p)}
                      className={chip(placement === p)}
                    >
                      {t.klub100.placements[p]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder={t.klub100.notePlaceholder}
                  className={`${input} mt-2`}
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-zinc-200">
                  {t.klub100.cheersRecording}{" "}
                  <span className="font-normal text-zinc-500">
                    {t.klub100.cheersOptionalLater}
                  </span>
                </p>
                <CheersCapture value={cheersFile} onChange={setCheersFile} />
              </div>

              {error && (
                <p className={errorText} role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {track && (
          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className={`${btnPrimary} w-full py-3`}
            >
              {isPending ? t.klub100.suggesting : t.klub100.suggestThis}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
