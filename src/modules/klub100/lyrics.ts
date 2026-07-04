/**
 * Pure LRC-lyrics parsing and chorus detection for the Klub 100 segment
 * picker (no "use server"/"use client" — safe to import anywhere, like
 * shared.ts). The chorus heuristic finds blocks of consecutive lines whose
 * text repeats elsewhere in the song — for pop/party songs that is almost
 * always the chorus — and turns each occurrence into a suggested segment.
 */

import { DEFAULT_SEGMENT_MS, MIN_SEGMENT_MS } from "./shared";

export type LyricLine = { timeMs: number; text: string };

export type ChorusSuggestion = {
  /** Suggested segment, clamped to track bounds. */
  startMs: number;
  endMs: number;
  /** First lyric line of the chorus block (chip tooltips). */
  firstLine: string;
  /** 1-based, in timeline order. */
  rank: number;
};

/** Serializable payload the lyrics server action returns to the dialogs. */
export type LyricsPayload = {
  lines: LyricLine[];
  suggestions: ChorusSuggestion[];
};

/**
 * Lowercase, strip diacritics and punctuation, collapse whitespace — so
 * "Gimme! Gimme! Gimme!" and "gimme gimme gimme" fingerprint identically.
 */
export function normalizeLine(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TIME_TAG = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  if (fraction.length === 1) return parseInt(fraction, 10) * 100;
  if (fraction.length === 2) return parseInt(fraction, 10) * 10;
  return parseInt(fraction, 10);
}

/**
 * Parse LRC text into timestamped lines sorted by time. Handles [mm:ss],
 * [mm:ss.xx], [mm:ss.xxx] and multiple timestamps per physical line; strips
 * enhanced-LRC inline <mm:ss.xx> word tags; metadata tags like [ar:…] fail
 * the numeric regex and are ignored. Timestamps whose text is empty mark
 * section boundaries and are returned separately as `gapTimesMs`.
 */
export function parseLrc(lrc: string): {
  lines: LyricLine[];
  gapTimesMs: number[];
} {
  const lines: LyricLine[] = [];
  const gapTimesMs: number[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    let textStart = 0;
    // Only consume timestamp tags at the start of the line (possibly several).
    while ((match = TIME_TAG.exec(raw)) !== null && match.index === textStart) {
      times.push(
        parseInt(match[1], 10) * 60_000 +
          parseInt(match[2], 10) * 1000 +
          fractionToMs(match[3]),
      );
      textStart = TIME_TAG.lastIndex;
    }
    if (times.length === 0) continue;

    const text = raw
      .slice(textStart)
      .replace(/<\d+:\d{1,2}(?:[.:]\d{1,3})?>/g, "")
      .trim();
    for (const timeMs of times) {
      if (text) lines.push({ timeMs, text });
      else gapTimesMs.push(timeMs);
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  gapTimesMs.sort((a, b) => a - b);
  return { lines, gapTimesMs };
}

/** A maximal run of consecutive repeated lines. */
type Block = {
  startIndex: number;
  endIndex: number; // inclusive
  fingerprints: string[];
};

/** Median gap between consecutive line timestamps (fallback 4s). */
function medianLineGapMs(lines: LyricLine[]): number {
  const gaps = lines
    .slice(1)
    .map((line, i) => line.timeMs - lines[i].timeMs)
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  if (gaps.length === 0) return 4000;
  return gaps[Math.floor(gaps.length / 2)];
}

/** Whether `shorter` occurs as a contiguous subsequence of `longer`. */
function isContiguousSubsequence(shorter: string[], longer: string[]): boolean {
  outer: for (let i = 0; i + shorter.length <= longer.length; i++) {
    for (let j = 0; j < shorter.length; j++) {
      if (longer[i + j] !== shorter[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Order-insensitive overlap: |A ∩ B| / |A ∪ B| over unique fingerprints. */
function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

function sameChorus(a: Block, b: Block): boolean {
  const [shorter, longer] =
    a.fingerprints.length <= b.fingerprints.length
      ? [a.fingerprints, b.fingerprints]
      : [b.fingerprints, a.fingerprints];
  return (
    isContiguousSubsequence(shorter, longer) ||
    jaccard(a.fingerprints, b.fingerprints) >= 0.6
  );
}

const MAX_SUGGESTIONS = 4;
const LEAD_IN_MS = 1500;
const MIN_BLOCK_LINES = 2;
const MIN_BLOCK_CHARS = 20;
/** Suggestions starting within this window of an earlier one are dropped. */
const DEDUPE_WINDOW_MS = 10_000;

/**
 * Detect chorus occurrences from repeated lyric-line blocks and turn each
 * into a suggested ~1 minute segment. Deterministic; returns at most
 * MAX_SUGGESTIONS suggestions sorted by start time.
 */
export function detectChoruses(
  lines: LyricLine[],
  gapTimesMs: number[],
  trackDurationMs: number,
): ChorusSuggestion[] {
  if (lines.length < 4) return [];

  const fingerprints = lines.map((line) => normalizeLine(line.text));
  const counts = new Map<string, number>();
  for (const fp of fingerprints) {
    if (fp) counts.set(fp, (counts.get(fp) ?? 0) + 1);
  }
  const isRepeated = (i: number) =>
    fingerprints[i].length > 0 && (counts.get(fingerprints[i]) ?? 0) >= 2;
  // Very short lines ("oh oh", "hey") repeat everywhere; they may extend a
  // block but must not anchor one.
  const mayAnchor = (i: number) => isRepeated(i) && fingerprints[i].length >= 3;

  // Group maximal runs of consecutive repeated lines into blocks.
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; ) {
    if (!mayAnchor(i)) {
      i++;
      continue;
    }
    let end = i;
    while (end + 1 < lines.length && isRepeated(end + 1)) end++;
    const blockFps = fingerprints.slice(i, end + 1);
    if (
      blockFps.length >= MIN_BLOCK_LINES &&
      blockFps.join("").length >= MIN_BLOCK_CHARS
    ) {
      blocks.push({ startIndex: i, endIndex: end, fingerprints: blockFps });
    }
    i = end + 1;
  }

  // Cluster blocks that are occurrences of the same chorus.
  const clusters: Block[][] = [];
  for (const block of blocks) {
    const cluster = clusters.find((c) => sameChorus(c[0], block));
    if (cluster) cluster.push(block);
    else clusters.push([block]);
  }

  const blockEndMs = (block: Block, fallbackGapMs: number): number => {
    const lastLineMs = lines[block.endIndex].timeMs;
    const nextLineMs = lines[block.endIndex + 1]?.timeMs ?? Infinity;
    const nextGapMs =
      gapTimesMs.find((gap) => gap > lastLineMs) ?? Infinity;
    const next = Math.min(nextLineMs, nextGapMs);
    return next !== Infinity ? next : lastLineMs + fallbackGapMs;
  };

  // Rank clusters by (occurrences, total duration); emit every occurrence of
  // the best cluster first, then the next, up to the cap.
  const fallbackGapMs = medianLineGapMs(lines);
  const ranked = clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => ({
      cluster,
      totalMs: cluster.reduce(
        (sum, block) =>
          sum + blockEndMs(block, fallbackGapMs) - lines[block.startIndex].timeMs,
        0,
      ),
    }))
    .sort(
      (a, b) =>
        b.cluster.length - a.cluster.length || b.totalMs - a.totalMs,
    );

  const chosen: { block: Block }[] = [];
  for (const { cluster } of ranked) {
    for (const block of cluster) {
      if (chosen.length >= MAX_SUGGESTIONS) break;
      chosen.push({ block });
    }
    if (chosen.length >= MAX_SUGGESTIONS) break;
  }

  // Build segments, sorted by position, deduping near-identical starts.
  const suggestions: ChorusSuggestion[] = [];
  const sorted = chosen
    .map(({ block }) => block)
    .sort((a, b) => lines[a.startIndex].timeMs - lines[b.startIndex].timeMs);
  for (const block of sorted) {
    const blockStartMs = lines[block.startIndex].timeMs;
    // Always suggest the classic full minute: it starts just before the
    // chorus and runs on, rather than a window as short as the chorus block.
    let startMs = Math.max(0, blockStartMs - LEAD_IN_MS);
    const endMs = Math.min(startMs + DEFAULT_SEGMENT_MS, trackDurationMs);
    startMs = Math.min(startMs, Math.max(0, endMs - DEFAULT_SEGMENT_MS));
    if (endMs - startMs < MIN_SEGMENT_MS) continue;
    if (
      suggestions.some((s) => Math.abs(s.startMs - startMs) < DEDUPE_WINDOW_MS)
    ) {
      continue;
    }
    suggestions.push({
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      firstLine: lines[block.startIndex].text,
      rank: suggestions.length + 1,
    });
  }
  return suggestions;
}
