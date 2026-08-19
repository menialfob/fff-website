import { prisma } from "@/lib/db";
import {
  PUSH_CATEGORIES,
  type PushCategory,
} from "@/lib/push-categories";

/**
 * Reading and writing the per-member notification preferences behind the
 * toggle list in the profile.
 *
 * The stored state is sparse — a row exists only for a category the member has
 * actually touched — so every read has to fill the gaps with the default
 * ("on"). That is what keeps a newly added category from being silently off
 * for everyone who set their preferences before it existed.
 */

/** Every category with its current value for one member. */
export async function getPushPreferences(
  userId: string,
): Promise<Record<PushCategory, boolean>> {
  const rows = await prisma.pushPreference.findMany({
    where: { userId },
    select: { category: true, enabled: true },
  });
  const stored = new Map(rows.map((r) => [r.category, r.enabled]));
  return Object.fromEntries(
    PUSH_CATEGORIES.map((category) => [category, stored.get(category) ?? true]),
  ) as Record<PushCategory, boolean>;
}

/** Persist one toggle. */
export async function setPushPreference(
  userId: string,
  category: PushCategory,
  enabled: boolean,
): Promise<void> {
  await prisma.pushPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, enabled },
    update: { enabled },
  });
}

/**
 * Narrow a recipient list to the members who still want this category — the
 * gate every push passes through (see `sendPushToUsers`). Only the "off" rows
 * are fetched, so the common case (nobody has opted out) is one small query
 * and no filtering at all.
 */
export async function recipientsWanting(
  userIds: string[],
  category: PushCategory,
): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const off = await prisma.pushPreference.findMany({
    where: { userId: { in: userIds }, category, enabled: false },
    select: { userId: true },
  });
  if (off.length === 0) return userIds;
  const silenced = new Set(off.map((r) => r.userId));
  return userIds.filter((id) => !silenced.has(id));
}
