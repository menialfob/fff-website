"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/i18n";
import { input, listCard } from "@/components/ui";
import type { SearchHitDTO } from "./data";
import { searchChatMessages } from "./actions";

const DEBOUNCE_MS = 350;

/** Bold the matched term inside a result body (case/locale-insensitive). */
function highlight(body: string, term: string) {
  const haystack = body.toLocaleLowerCase("da");
  const needle = term.toLocaleLowerCase("da");
  const idx = haystack.indexOf(needle);
  if (idx === -1 || !needle) return body;
  // Trim long bodies around the first match.
  const start = Math.max(0, idx - 40);
  const prefix = start > 0 ? "…" : "";
  return (
    <Fragment>
      {prefix}
      {body.slice(start, idx)}
      <mark className="rounded bg-violet-500/30 px-0.5 text-white">
        {body.slice(idx, idx + needle.length)}
      </mark>
      {body.slice(idx + needle.length, idx + needle.length + 120)}
    </Fragment>
  );
}

export function ChatSearch() {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHitDTO[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = query.trim();
    if (term.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      const mySeq = ++seq.current;
      searchChatMessages(term)
        .then((results) => {
          if (mySeq !== seq.current) return;
          setHits(results);
        })
        .catch(() => {})
        .finally(() => {
          if (mySeq === seq.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.chat.searchPlaceholder}
        className={input}
        autoFocus
        autoComplete="off"
      />

      {searching && (
        <p className="text-center text-sm text-zinc-500">{t.common.loading}</p>
      )}

      {hits !== null && !searching && hits.length === 0 && (
        <p className="text-center text-sm text-zinc-500">
          {t.chat.searchNoResults}
        </p>
      )}

      {hits !== null && hits.length > 0 && (
        <div className={listCard}>
          {hits.map((hit) => (
            <Link
              key={hit.messageId}
              href={`/chat/${hit.slug}?m=${hit.messageId}`}
              className="block p-4 transition hover:bg-white/[0.03]"
            >
              <p className="mb-0.5 flex items-baseline justify-between gap-2 text-xs text-zinc-500">
                <span className="truncate font-semibold text-zinc-400">
                  {hit.conversationTitle}
                  {hit.authorName ? ` · ${hit.authorName}` : ""}
                </span>
                <span className="shrink-0">
                  {formatDateTime(new Date(hit.createdAt), locale)}
                </span>
              </p>
              <p className="truncate text-sm text-zinc-200">
                {highlight(hit.body, query.trim())}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
