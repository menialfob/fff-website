"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { chip } from "@/components/ui";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import type { Segment } from "./segment-picker";
import type { ChorusSuggestion, LyricLine, LyricsPayload } from "./lyrics";
import { formatMs } from "./shared";

/** How far before a tapped lyric line the segment starts. */
const LINE_LEAD_IN_MS = 500;

/**
 * Lyrics-based help for the segment picker: one-tap chorus suggestion chips
 * and a tappable synced-lyrics list. Rendered directly below
 * <SegmentPicker>; shares its seg1/seg2/onChange so taps move the same
 * segments the picker drags.
 */
export function LyricsAssist({
  lyrics,
  durationMs,
  seg1,
  seg2,
  onChange,
}: {
  lyrics: LyricsPayload | null | "loading";
  durationMs: number;
  seg1: Segment;
  seg2: Segment | null;
  onChange: (seg1: Segment, seg2: Segment | null) => void;
}) {
  const { t, fmt } = useI18n();
  const [showLyrics, setShowLyrics] = useState(false);
  // Which segment chips and lyric taps modify; only relevant with a seg2.
  const [target, setTarget] = useState<1 | 2>(1);
  const effectiveTarget = seg2 ? target : 1;
  const targetSeg = effectiveTarget === 2 && seg2 ? seg2 : seg1;

  if (lyrics === "loading") {
    return (
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-9 w-28 animate-pulse rounded-full bg-white/5"
          />
        ))}
      </div>
    );
  }

  if (lyrics === null) {
    return <p className="text-sm text-zinc-500">{t.klub100.noLyricsFound}</p>;
  }

  const setSegment = (startMs: number, endMs: number) => {
    const next = { startMs, endMs };
    if (effectiveTarget === 2) onChange(seg1, next);
    else onChange(next, seg2);
  };

  const applySuggestion = (s: ChorusSuggestion) => setSegment(s.startMs, s.endMs);

  const jumpToLine = (line: LyricLine) => {
    const length = targetSeg.endMs - targetSeg.startMs;
    const start = Math.min(
      Math.max(0, line.timeMs - LINE_LEAD_IN_MS),
      Math.max(0, durationMs - length),
    );
    setSegment(Math.round(start), Math.round(start + length));
  };

  const isSelected = (s: ChorusSuggestion) =>
    targetSeg.startMs === s.startMs && targetSeg.endMs === s.endMs;

  return (
    <div className="space-y-3">
      {seg2 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">{t.klub100.applyToMinute}</span>
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTarget(n)}
              className={chip(effectiveTarget === n)}
            >
              {fmt(t.klub100.minuteChipN, { n })}
            </button>
          ))}
        </div>
      )}

      {lyrics.suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-zinc-400">
            {t.klub100.chorusSuggestionsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {lyrics.suggestions.map((s) => (
              <button
                key={s.rank}
                type="button"
                onClick={() => applySuggestion(s)}
                title={s.firstLine}
                className={chip(isSelected(s))}
              >
                {fmt(t.klub100.chorusN, { n: s.rank })} · {formatMs(s.startMs)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowLyrics((v) => !v)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
        >
          {showLyrics ? t.klub100.hideLyrics : t.klub100.showLyrics}
          {showLyrics ? (
            <ChevronUpIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </button>
        {showLyrics && (
          <LyricsList
            lines={lyrics.lines}
            targetSeg={targetSeg}
            targetWhich={effectiveTarget}
            onLineTap={jumpToLine}
          />
        )}
      </div>
    </div>
  );
}

function LyricsList({
  lines,
  targetSeg,
  targetWhich,
  onLineTap,
}: {
  lines: LyricLine[];
  targetSeg: Segment;
  targetWhich: 1 | 2;
  onLineTap: (line: LyricLine) => void;
}) {
  const { t } = useI18n();
  const firstInSegmentRef = useRef<HTMLLIElement>(null);

  const inSegment = (line: LyricLine) =>
    line.timeMs >= targetSeg.startMs && line.timeMs < targetSeg.endMs;
  const firstInSegmentIndex = lines.findIndex(inSegment);

  // Open the list at the current segment, not the song intro.
  useEffect(() => {
    firstInSegmentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const highlight =
    targetWhich === 2
      ? "bg-fuchsia-400/10 text-fuchsia-100"
      : "bg-amber-400/10 text-amber-100";

  return (
    <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/20">
      <p className="border-b border-white/10 px-3 py-2 text-xs text-zinc-500">
        {t.klub100.lyricsHint}
      </p>
      <ul className="max-h-64 overflow-y-auto py-1">
        {lines.map((line, i) => (
          <li key={i} ref={i === firstInSegmentIndex ? firstInSegmentRef : null}>
            <button
              type="button"
              onClick={() => onLineTap(line)}
              className={`flex w-full cursor-pointer items-baseline gap-2.5 px-3 py-2 text-left transition hover:bg-white/5 ${
                inSegment(line) ? highlight : "text-zinc-300"
              }`}
            >
              <span className="w-9 shrink-0 text-xs tabular-nums text-zinc-500">
                {formatMs(line.timeMs)}
              </span>
              <span className="text-sm">{line.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-white/10 px-3 py-2 text-xs text-zinc-500">
        {t.klub100.lyricsTimingNote} · {t.klub100.lyricsAttribution}
      </p>
    </div>
  );
}
