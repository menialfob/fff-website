import { prisma } from "@/lib/db";
import { avatarUrlFor } from "@/components/avatar";
import type { ExtraRole } from "@/lib/roles";
import type {
  MessageDTO,
  PollDTO,
  ReactionSummary,
} from "@/lib/realtime";
import type { ConversationType } from "@prisma/client";

// Include shape used everywhere a message is turned into a DTO, so the live
// (SSE) payload and the server-rendered page always agree.
export const messageInclude = {
  author: {
    select: {
      id: true,
      name: true,
      avatarStoredName: true,
      avatarUpdatedAt: true,
    },
  },
  reactions: { select: { emoji: true, userId: true } },
  event: { select: { id: true, title: true } },
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

type RawAuthor = {
  id: string;
  name: string;
  avatarStoredName: string | null;
  avatarUpdatedAt: Date | null;
};

type RawMessage = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: Date;
  author: RawAuthor | null;
  reactions: RawReaction[];
  poll: RawPoll | null;
  event: { id: string; title: string } | null;
  eventDate: string | null;
};

export function buildMessageDTO(msg: RawMessage): MessageDTO {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author
      ? {
          id: msg.author.id,
          name: msg.author.name,
          avatarUrl: avatarUrlFor(msg.author),
        }
      : null,
    reactions: summarizeReactions(msg.reactions),
    poll: msg.poll ? buildPollDTO(msg.poll) : null,
    // goingCount filled in by enrichEventCounts (needs a query).
    event:
      msg.event && msg.eventDate
        ? {
            eventId: msg.event.id,
            date: msg.eventDate,
            title: msg.event.title,
            goingCount: 0,
          }
        : null,
  };
}

/** Fill in live "going" counts for any event-card messages (batched). */
export async function enrichEventCounts(dtos: MessageDTO[]): Promise<MessageDTO[]> {
  await Promise.all(
    dtos
      .filter((d) => d.event)
      .map(async (d) => {
        d.event!.goingCount = await prisma.eventAttendance.count({
          where: { eventId: d.event!.eventId, date: d.event!.date, status: "GOING" },
        });
      }),
  );
  return dtos;
}

export type Viewer = { role: "ADMIN" | "MEMBER"; extraRoles?: ExtraRole[] };

type ConversationGate = {
  type: ConversationType;
  requiredRole: ExtraRole | null;
};

/**
 * Whether a viewer may see/post in a conversation. Channels are gated by role
 * (null = everyone, admins always pass); DMs and groups by membership, which
 * the caller resolves (`isMember`) since it comes from different places — a
 * joined member list, a per-user membership query, or a members include.
 */
export function canAccessConversation(
  conversation: ConversationGate,
  viewer: Viewer,
  isMember: boolean,
): boolean {
  if (conversation.type !== "CHANNEL") return isMember;
  if (!conversation.requiredRole) return true;
  if (viewer.role === "ADMIN") return true;
  return viewer.extraRoles?.includes(conversation.requiredRole) ?? false;
}

/**
 * Conversations the viewer can see: role-passing channels plus DMs/groups
 * they are a member of. Channels first (display order), then the rest by
 * latest activity.
 */
export async function conversationsForViewer(viewer: Viewer, userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ type: "CHANNEL" }, { members: { some: { userId } } }] },
    include: {
      members: {
        select: {
          userId: true,
          isAdmin: true,
          user: {
            select: {
              name: true,
              avatarStoredName: true,
              avatarUpdatedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return conversations.filter((c) =>
    canAccessConversation(c, viewer, c.members.some((m) => m.userId === userId)),
  );
}

/** Ids of every conversation the viewer may receive events for (SSE filter). */
export async function accessibleConversationIds(
  viewer: Viewer,
  userId: string,
): Promise<string[]> {
  const conversations = await conversationsForViewer(viewer, userId);
  return conversations.map((c) => c.id);
}

/** Most recent messages in a conversation (oldest-first for rendering). */
export async function conversationMessages(conversationId: string, take = 50) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
    include: messageInclude,
  });
  return enrichEventCounts(rows.reverse().map(buildMessageDTO));
}

/**
 * Active members of a conversation (for presence name lookup and pushes).
 * Channels: every active user passing the role gate. DMs/groups: the stored
 * member rows.
 */
export async function conversationMembers(conversation: {
  id: string;
  type: ConversationType;
  requiredRole: ExtraRole | null;
}): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  if (conversation.type !== "CHANNEL") {
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: conversation.id, user: { isActive: true } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            avatarStoredName: true,
            avatarUpdatedAt: true,
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    });
    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: avatarUrlFor(m.user),
    }));
  }
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      role: true,
      avatarStoredName: true,
      avatarUpdatedAt: true,
      extraRoles: { select: { role: true } },
    },
    orderBy: { name: "asc" },
  });
  return users
    .filter((u) =>
      canAccessConversation(
        conversation,
        { role: u.role, extraRoles: u.extraRoles.map((r) => r.role) },
        false,
      ),
    )
    .map((u) => ({ id: u.id, name: u.name, avatarUrl: avatarUrlFor(u) }));
}

/**
 * The name a conversation shows a given viewer: channels and groups have
 * their own name; a DM shows the other member.
 */
export function conversationDisplayName(
  conversation: {
    type: ConversationType;
    name: string | null;
    members?: { userId: string; user?: { name: string } }[];
  },
  viewerUserId: string,
): string {
  if (conversation.type === "DM") {
    const other = conversation.members?.find((m) => m.userId !== viewerUserId);
    return other?.user?.name ?? "";
  }
  return conversation.name ?? "";
}

/**
 * Conversation list with unread counts + last-message preview for the index
 * page.
 */
export async function conversationSummaries(viewer: Viewer, userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ type: "CHANNEL" }, { members: { some: { userId } } }] },
    include: {
      members: {
        select: {
          userId: true,
          isAdmin: true,
          user: {
            select: {
              name: true,
              avatarStoredName: true,
              avatarUpdatedAt: true,
            },
          },
        },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const visible = conversations.filter((c) =>
    canAccessConversation(c, viewer, c.members.some((m) => m.userId === userId)),
  );
  return Promise.all(
    visible.map(async (conversation) => {
      const [last, read] = await Promise.all([
        prisma.message.findFirst({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } }, poll: { select: { question: true } } },
        }),
        prisma.conversationRead.findUnique({
          where: { userId_conversationId: { userId, conversationId: conversation.id } },
        }),
      ]);
      const unread = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          authorId: { not: userId },
          createdAt: { gt: read?.lastReadAt ?? new Date(0) },
        },
      });
      // DMs show the other member's face; channels/groups fall back to the
      // gradient initial of the conversation itself.
      const dmPartner =
        conversation.type === "DM"
          ? conversation.members.find((m) => m.userId !== userId)
          : undefined;
      return {
        conversation,
        title: conversationDisplayName(conversation, userId),
        avatar: dmPartner
          ? {
              id: dmPartner.userId,
              name: dmPartner.user.name,
              avatarUrl: avatarUrlFor({ id: dmPartner.userId, ...dmPartner.user }),
            }
          : null,
        unread,
        muted: read?.muted ?? false,
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
 * Total unread messages across every conversation the viewer can see. Same
 * rule as the per-conversation pills on the chat index (messages from others,
 * newer than the read cursor), summed for the app-icon badge.
 */
export async function chatUnreadCount(
  viewer: Viewer,
  userId: string,
): Promise<number> {
  const conversations = await conversationsForViewer(viewer, userId);
  if (conversations.length === 0) return 0;

  const reads = await prisma.conversationRead.findMany({
    where: { userId, conversationId: { in: conversations.map((c) => c.id) } },
    select: { conversationId: true, lastReadAt: true },
  });
  const readAt = new Map(reads.map((r) => [r.conversationId, r.lastReadAt]));

  const counts = await Promise.all(
    conversations.map((conversation) =>
      prisma.message.count({
        where: {
          conversationId: conversation.id,
          authorId: { not: userId },
          createdAt: { gt: readAt.get(conversation.id) ?? new Date(0) },
        },
      }),
    ),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Active member ids that should receive a push for activity in a
 * conversation: everyone with access, minus the actor, minus anyone currently
 * connected (they get the live update instead, so we don't double-notify).
 */
export async function pushRecipients(
  conversation: {
    id: string;
    type: ConversationType;
    requiredRole: ExtraRole | null;
  },
  actorId: string,
  onlineIds: string[],
): Promise<string[]> {
  const online = new Set(onlineIds);
  const members = await conversationMembers(conversation);
  return members
    .filter((m) => m.id !== actorId && !online.has(m.id))
    .map((m) => m.id);
}

/** The URL path segment addressing a conversation (seeded key, else id). */
export function conversationSlug(conversation: {
  id: string;
  key: string | null;
}): string {
  return conversation.key ?? conversation.id;
}

/**
 * Lowercase for search storage/matching. JS locale lowercasing handles
 * Æ/Ø/Å correctly where SQLite's ASCII-only lower()/LIKE would not.
 */
export function toSearchText(body: string): string {
  return body.toLocaleLowerCase("da");
}
