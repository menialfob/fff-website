import { prisma } from "@/lib/db";
import type { ExtraRole } from "@/lib/roles";
import type {
  MessageDTO,
  PollDTO,
  ReactionSummary,
} from "@/lib/realtime";

// Include shape used everywhere a message is turned into a DTO, so the live
// (SSE) payload and the server-rendered page always agree.
export const messageInclude = {
  author: { select: { id: true, name: true } },
  reactions: { select: { emoji: true, userId: true } },
  poll: {
    include: {
      options: {
        orderBy: { order: "asc" as const },
        include: { votes: { select: { userId: true } } },
      },
    },
  },
} as const;

type RawReaction = { emoji: string; userId: string };

export function summarizeReactions(reactions: RawReaction[]): ReactionSummary[] {
  const byEmoji = new Map<string, string[]>();
  for (const r of reactions) {
    const arr = byEmoji.get(r.emoji) ?? [];
    arr.push(r.userId);
    byEmoji.set(r.emoji, arr);
  }
  return [...byEmoji.entries()].map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

type RawPoll = {
  id: string;
  question: string;
  multiple: boolean;
  closesAt: Date | null;
  options: { id: string; text: string; votes: { userId: string }[] }[];
};

export function buildPollDTO(poll: RawPoll): PollDTO {
  return {
    id: poll.id,
    question: poll.question,
    multiple: poll.multiple,
    closesAt: poll.closesAt ? poll.closesAt.toISOString() : null,
    options: poll.options.map((o) => ({ id: o.id, text: o.text })),
    tallies: poll.options.map((o) => ({
      optionId: o.id,
      count: o.votes.length,
      userIds: o.votes.map((v) => v.userId),
    })),
  };
}

type RawMessage = {
  id: string;
  channelId: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string } | null;
  reactions: RawReaction[];
  poll: RawPoll | null;
};

export function buildMessageDTO(msg: RawMessage): MessageDTO {
  return {
    id: msg.id,
    channelId: msg.channelId,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author ? { id: msg.author.id, name: msg.author.name } : null,
    reactions: summarizeReactions(msg.reactions),
    poll: msg.poll ? buildPollDTO(msg.poll) : null,
  };
}

type Viewer = { role: "ADMIN" | "MEMBER"; extraRoles?: ExtraRole[] };

/** Whether a viewer may see/post in a channel (role gate + admin superuser). */
export function canAccessChannel(
  channel: { requiredRole: ExtraRole | null },
  viewer: Viewer,
): boolean {
  if (!channel.requiredRole) return true;
  if (viewer.role === "ADMIN") return true;
  return viewer.extraRoles?.includes(channel.requiredRole) ?? false;
}

/** Channels the viewer can see, in display order. */
export async function channelsForViewer(viewer: Viewer) {
  const channels = await prisma.channel.findMany({ orderBy: { order: "asc" } });
  return channels.filter((c) => canAccessChannel(c, viewer));
}

/** Most recent messages in a channel (oldest-first for rendering). */
export async function channelMessages(channelId: string, take = 50) {
  const rows = await prisma.channelMessage.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take,
    include: messageInclude,
  });
  return rows.reverse().map(buildMessageDTO);
}

/** Active members who can access a channel (for presence name lookup). */
export async function channelMembers(channel: {
  requiredRole: ExtraRole | null;
}): Promise<{ id: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, extraRoles: { select: { role: true } } },
    orderBy: { name: "asc" },
  });
  return users
    .filter((u) =>
      canAccessChannel(channel, {
        role: u.role,
        extraRoles: u.extraRoles.map((r) => r.role),
      }),
    )
    .map((u) => ({ id: u.id, name: u.name }));
}

/** Channel list with unread counts + last-message preview for the index page. */
export async function channelSummaries(viewer: Viewer, userId: string) {
  const channels = await channelsForViewer(viewer);
  return Promise.all(
    channels.map(async (channel) => {
      const [last, read] = await Promise.all([
        prisma.channelMessage.findFirst({
          where: { channelId: channel.id },
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } }, poll: { select: { question: true } } },
        }),
        prisma.channelRead.findUnique({
          where: { userId_channelId: { userId, channelId: channel.id } },
        }),
      ]);
      const unread = await prisma.channelMessage.count({
        where: {
          channelId: channel.id,
          authorId: { not: userId },
          createdAt: { gt: read?.lastReadAt ?? new Date(0) },
        },
      });
      return {
        channel,
        unread,
        last: last
          ? {
              authorName: last.author?.name ?? null,
              // Polls have an empty body — preview the question instead.
              preview: last.poll ? `📊 ${last.poll.question}` : last.body,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
      };
    }),
  );
}

/**
 * Active member ids that should receive a push for activity in a channel:
 * everyone with access, minus the actor, minus anyone currently connected
 * (they get the live update instead, so we don't double-notify).
 */
export async function pushRecipients(
  channel: { requiredRole: ExtraRole | null },
  actorId: string,
  onlineIds: string[],
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, role: true, extraRoles: { select: { role: true } } },
  });
  const online = new Set(onlineIds);
  return users
    .filter((u) => u.id !== actorId && !online.has(u.id))
    .filter((u) =>
      canAccessChannel(channel, {
        role: u.role,
        extraRoles: u.extraRoles.map((r) => r.role),
      }),
    )
    .map((u) => u.id);
}
