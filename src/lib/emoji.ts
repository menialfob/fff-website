/**
 * Detection for "jumbo" messages: short, emoji-only bodies render extra large
 * (Messenger/WhatsApp convention).
 */

const JUMBO_MAX_CLUSTERS = 3;

// Everything that may legitimately appear inside emoji sequences: pictographs,
// components (skin tones, hair), ZWJ, variation selectors, keycap combining
// marks, tag characters (flags), and whitespace between emoji.
const emojiOnlyPattern =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|⃣|[\u{E0020}-\u{E007F}]|\s)+$/u;

/** True when the body is 1–3 emoji and nothing else. */
export function isJumboEmoji(body: string): boolean {
  const text = body.trim();
  if (!text || !emojiOnlyPattern.test(text)) return false;
  // Digits/#/* are Emoji_Component (keycap parts) — a plain "123" must not
  // count as emoji. Require at least one actual pictograph.
  if (!/\p{Extended_Pictographic}/u.test(text)) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let clusters = 0;
  for (const seg of segmenter.segment(text)) {
    if (seg.segment.trim() === "") continue;
    clusters += 1;
    if (clusters > JUMBO_MAX_CLUSTERS) return false;
  }
  return clusters > 0;
}
