/**
 * The notification categories a member can switch on and off in their profile.
 *
 * Kept free of server imports (no Prisma, no web-push) so the client component
 * that renders the toggle list can import the list and its type directly; the
 * database side lives in src/lib/push-prefs.ts and the sender in src/lib/push.ts.
 *
 * The four section categories deliberately carry the same ids as
 * `Section` in src/lib/activity.ts — every badge-raising event is announced by
 * `notifyMembers`, which passes its section straight through as the category,
 * so a member's toggle always governs exactly the events that raise that badge.
 * (TypeScript enforces the overlap at that call site: a section missing here
 * would not be assignable to `PushCategory`.)
 *
 * The order is the order the toggles are listed in — chat first, since it is
 * by far the chattiest source.
 */
export const PUSH_CATEGORIES = [
  /** Messages in shared channels (#general and friends). */
  "chatChannel",
  /** Messages in DMs and groups. */
  "chatDirect",
  /** Someone @-mentioned you. Separate because a mention is addressed to you
   *  personally: it already bypasses a muted conversation, so it gets to
   *  bypass the chat toggles too. */
  "mention",
  "forum",
  "calendar",
  "files",
  "members",
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export function isPushCategory(value: string): value is PushCategory {
  return (PUSH_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Which toggle governs a chat push. Channels are the noisy shared rooms;
 * DMs and groups are aimed at you, so members can keep those while silencing
 * the channels.
 */
export function chatCategory(
  type: "CHANNEL" | "DM" | "GROUP",
): Extract<PushCategory, "chatChannel" | "chatDirect"> {
  return type === "CHANNEL" ? "chatChannel" : "chatDirect";
}
