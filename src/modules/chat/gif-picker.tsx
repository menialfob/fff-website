"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { input } from "@/components/ui";
import type { GifSearchResult } from "@/app/api/chat/gif/route";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Tenor GIF picker panel: debounced search over the server proxy, masonry-ish
 * two-column grid of animated previews, tap to send. "Load more" pages with
 * Tenor's cursor. Attribution required by Tenor's terms.
 */
export function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (tenorId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifSearchResult[]>([]);
  const [next, setNext] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  function load(q: string, pos: string) {
    const seq = ++requestSeq.current;
    setLoading(true);
    setFailed(false);
    const url = new URL("/api/chat/gif", window.location.origin);
    if (q) url.searchParams.set("q", q);
    if (pos) url.searchParams.set("pos", pos);
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { results: GifSearchResult[]; next?: string }) => {
        if (seq !== requestSeq.current) return;
        setResults((prev) => (pos ? [...prev, ...data.results] : data.results));
        setNext(data.next ?? "");
      })
      .catch(() => {
        if (seq === requestSeq.current) setFailed(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }

  // Featured on open, then debounced search-as-you-type.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => load(query.trim(), ""),
      query ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return (
    <div className="mb-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.chat.gifSearchPlaceholder}
          className={input}
          autoFocus
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.cancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
        {results.map((gif) => (
          <button
            key={gif.id}
            type="button"
            onClick={() => onPick(gif.id)}
            className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03]"
            style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Tenor preview (searcher only; sends store locally) */}
            <img
              src={gif.previewUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              draggable={false}
            />
          </button>
        ))}
        {next && !loading && (
          <button
            type="button"
            onClick={() => load(query.trim(), next)}
            className="col-span-full rounded-lg border border-white/[0.08] py-2 text-xs text-zinc-400 transition hover:border-white/20"
          >
            {t.chat.gifMore}
          </button>
        )}
      </div>

      {loading && (
        <p className="py-3 text-center text-xs text-zinc-500">
          {t.common.loading}
        </p>
      )}
      {failed && (
        <p className="py-3 text-center text-xs text-red-400">
          {t.errors.gifUnavailable}
        </p>
      )}
      {!loading && !failed && results.length === 0 && (
        <p className="py-3 text-center text-xs text-zinc-500">
          {t.chat.gifNone}
        </p>
      )}

      <p className="pt-1 text-right text-[0.6rem] text-zinc-600">
        {t.chat.gifBy}
      </p>
    </div>
  );
}
