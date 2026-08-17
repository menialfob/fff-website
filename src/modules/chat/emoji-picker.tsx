"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { input } from "@/components/ui";
import type { Locale } from "@/lib/i18n";

type EmojiEntry = {
  emoji: string;
  label: string;
  tags?: string[];
  group?: number;
  order?: number;
  skins?: { emoji: string }[];
};

type EmojiData = {
  entries: EmojiEntry[];
  groups: { key: string; message: string; order: number }[];
};

// The component group holds skin-tone/hair modifiers — never shown directly.
const COMPONENT_GROUP_KEY = "component";
const TONE_STORAGE_KEY = "fff-emoji-tone";
// Index into an emoji's skins array (0 = light … 4 = dark); null = default.
const TONES = ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"];

// Module-level cache: the ~700KB dataset is fetched once per session.
const cache = new Map<string, Promise<EmojiData>>();

function loadEmojiData(locale: Locale): Promise<EmojiData> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const promise = Promise.all([
    fetch(`/emoji/${locale}/data.json`).then((r) => r.json()),
    fetch(`/emoji/${locale}/messages.json`).then((r) => r.json()),
  ]).then(([data, messages]) => {
    const groups = (
      messages.groups as { key: string; message: string; order: number }[]
    ).filter((g) => g.key !== COMPONENT_GROUP_KEY);
    const componentOrder = (
      messages.groups as { key: string; message: string; order: number }[]
    ).find((g) => g.key === COMPONENT_GROUP_KEY)?.order;
    const entries = (data as EmojiEntry[]).filter(
      (e) => e.emoji && e.group !== undefined && e.group !== componentOrder,
    );
    return { entries, groups };
  });
  cache.set(locale, promise);
  return promise;
}

/**
 * Emoji picker backed by self-hosted emojibase data (same-origin fetch, no
 * third-party calls). Search over localized labels/tags, category sections,
 * and a persistent skin-tone preference applied to emoji that support one.
 */
export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<EmojiData | null>(null);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadEmojiData(locale)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [locale]);

  useEffect(() => {
    const stored = localStorage.getItem(TONE_STORAGE_KEY);
    if (stored !== null && stored !== "") setTone(Number(stored));
  }, []);

  function pickTone(next: number | null) {
    setTone(next);
    localStorage.setItem(TONE_STORAGE_KEY, next === null ? "" : String(next));
  }

  function resolveEmoji(entry: EmojiEntry): string {
    if (tone !== null && entry.skins && entry.skins[tone]) {
      return entry.skins[tone].emoji;
    }
    return entry.emoji;
  }

  const sections = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLocaleLowerCase();
    const matches = q
      ? data.entries.filter(
          (e) =>
            e.label.includes(q) || e.tags?.some((tag) => tag.includes(q)),
        )
      : data.entries;
    if (q) return [{ key: "search", label: "", entries: matches.slice(0, 120) }];
    return data.groups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        key: g.key,
        label: g.message,
        entries: matches
          .filter((e) => e.group === g.order)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }))
      .filter((s) => s.entries.length > 0);
  }, [data, query]);

  return (
    <div className="mb-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.chat.emojiSearch}
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

      {/* Skin-tone preference. */}
      <div className="mb-1 flex justify-end gap-0.5">
        {TONES.map((sample, i) => {
          const value = i === 0 ? null : i - 1;
          const active = tone === value;
          return (
            <button
              key={sample}
              type="button"
              onClick={() => pickTone(value)}
              aria-pressed={active}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition ${
                active ? "bg-violet-500/30" : "hover:bg-white/10"
              }`}
            >
              {sample}
            </button>
          );
        })}
      </div>

      <div ref={listRef} className="max-h-64 overflow-y-auto">
        {!data ? (
          <p className="py-6 text-center text-xs text-zinc-500">
            {t.common.loading}
          </p>
        ) : sections.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-500">
            {t.chat.emojiNoResults}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.key}>
              {section.label && (
                <p className="sticky top-0 bg-panel/95 px-1 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur">
                  {section.label}
                </p>
              )}
              <div className="grid grid-cols-8 sm:grid-cols-10">
                {section.entries.map((entry) => (
                  <button
                    key={entry.emoji}
                    type="button"
                    title={entry.label}
                    onClick={() => onPick(resolveEmoji(entry))}
                    className="flex h-9 items-center justify-center rounded-lg text-xl transition hover:bg-white/10"
                  >
                    {resolveEmoji(entry)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
