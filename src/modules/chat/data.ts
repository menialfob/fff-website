import { prisma } from "@/lib/db";
import { avatarUrlFor } from "@/components/avatar";
import type { ExtraRole } from "@/lib/roles";
import { emitEvent } from "@/lib/realtime";
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
  mentions: { select: { userId: true, offset: true, length: true } },
  attachments: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      kind: true,
      name: true,
      mimeType: true,
      size: true,
      width: true,
      height: true,
      blurData: true,
      thumbName: true,
    },
  },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      author: { select: { name: true } },
      poll: { select: { question: true } },
      event: { select: { title: true } },
    },
  },
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

type RawAttachment = {
  id: string;
  kind: "IMAGE" | "FILE" | "GIF";
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  blurData: string | null;
  thumbName: string | null;
};

type RawReply = {
  id: string;
  body: string;
  deletedAt: Date | null;
  author: { name: string } | null;
  poll: { question: string } | null;
  event: { title: string } | null;
};

type RawMessage = {
  id: string;
  conversationId: string;
  body: string;
  createdAt: Date;
  clientId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  replyTo: RawReply | null;
  attachments: RawAttachment[];
  mentions: { userId: string; offset: number; length: number }[];
  author: RawAuthor | null;
  reactions: RawReaction[];
  poll: RawPoll | null;
  event: { id: string; title: string } | null;
  eventDate: string | null;
};

const REPLY_PREVIEW_MAX = 120;

/** Short text summary of a quoted message for the reply block. */
function replyPreview(reply: RawReply): string {
  if (reply.deletedAt) return "";
  if (reply.poll) return `\u{1F4CA} ${reply.poll.question}`;
  if (reply.event) return `\u{1F4C5} ${reply.event.title}`;
  return reply.body.slice(0, REPLY_PREVIEW_MAX);
}

export function buildMessageDTO(msg: RawMessage): MessageDTO {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    clientId: msg.clientId,
    editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
    deleted: msg.deletedAt !== null,
    replyTo: msg.replyTo
      ? {
          id: msg.replyTo.id,
          authorName: msg.replyTo.author?.name ?? null,
          preview: replyPreview(msg.replyTo),
          deleted: msg.replyTo.deletedAt !== null,
        }
      : null,
    mentions: msg.mentions,
    attachments: msg.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      width: a.width,
      height: a.height,
      blurData: a.blurData,
      url: `/api/chat/media/${a.id}`,
      thumbUrl: a.thumbName ? `/api/chat/media/${a.id}?v=thumb` : null,
    })),
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

/**
 * The only thing chat access depends on: the extra roles the viewer holds. The
 * site-admin flag is deliberately absent — see `canAccessConversation`.
 */
export type Viewer = { extraRoles?: ExtraRole[] };

/**
 * The viewer's current roles, read from the database — never from the session
 * token. A role-gated channel has no member rows: holding the role *is* the
 * membership, and roles are granted and revoked ad hoc, while a JWT is only
 * re-minted at login and lives up to a week (see src/lib/auth.config.ts). So
 * trusting `session.user.extraRoles` here would leave a former bestyrelse
 * member reading the channel for days after losing the role, and make a new
 * one wait for a re-login to get in. Every chat access check resolves the
 * viewer through this instead, so a role change takes effect on the next
 * request.
 */
export async function viewerFor(userId: string): Promise<Viewer> {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: true },
  });
  return { extraRoles: roles.map((r) => r.role) };
}

/**
 * Announce the current holders of every channel gated on `role` after a grant
 * or revoke, so open clients follow the change without a reload: each SSE
 * connection recomputes its allow-set from `memberIds` (exactly as it does for
 * group membership) and the conversation list refetches, making the channel
 * appear for a new holder and disappear for a former one.
 */
export async function broadcastRoleChannelMembership(
  role: ExtraRole,
  granted: boolean,
): Promise<void> {
  const channels = await prisma.conversation.findMany({
    where: { type: "CHANNEL", requiredRole: role },
    select: { id: true },
  });
  if (channels.length === 0) return;
  const holders = await prisma.userRole.findMany({
    where: { role },
    select: { userId: true },
  });
  const memberIds = holders.map((h) => h.userId);
  for (const channel of channels) {
    emitEvent({
      type: "conversation",
      conversationId: channel.id,
      kind: granted ? "member-added" : "member-removed",
      memberIds,
    });
  }
}

type ConversationGate = {
  type: ConversationType;
  requiredRole: ExtraRole | null;
};

/**
 * Whether a viewer may see/post in a conversation. Channels are gated by role
 * (null = everyone, otherwise the role must be held); DMs and groups by
 * membership, which the caller resolves (`isMember`) since it comes from
 * different places — a joined member list, a per-user membership query, or a
 * members include.
 *
 * Unlike module access (src/modules/registry.ts) and `requireRole`, the
 * site-admin flag grants nothing here: an internal channel such as
 * "bestyrelse" is private conversation, not administrable content, so only
 * holders of its role see it — an admin outside the board gets no listing, no
 * messages, no unread count and no pushes. Admins who *are* on the board pass
 * through their own BESTYRELSE role like everyone else.
 */
export function canAccessConversation(
  conversation: ConversationGate,
  viewer: Viewer,
  isMember: boolean,
): boolean {
  if (conversation.type !== "CHANNEL") return isMember;
  if (!conversation.requiredRole) return true;
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
        { extraRoles: u.extraRoles.map((r) => r.role) },
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

export type ConversationSummaryDTO = {
  id: string;
  slug: string;
  type: ConversationType;
  title: string;
  avatar: { id: string; name: string; avatarUrl: string | null } | null;
  unread: number;
  muted: boolean;
  lastMessageAt: string | null;
  last: {
    authorName: string | null;
    preview: string;
    createdAt: string;
  } | null;
};

/**
 * Conversation list with unread counts + last-message preview for the index
 * page: channels first (their display order), then DMs/groups by latest
 * activity.
 */
export async function conversationSummaries(
  viewer: Viewer,
  userId: string,
): Promise<ConversationSummaryDTO[]> {
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
  const visible = conversations
    .filter((c) =>
      canAccessConversation(c, viewer, c.members.some((m) => m.userId === userId)),
    )
    .sort((a, b) => {
      // Channels stay pinned on top in display order; everything else by
      // latest activity, newest first.
      const aChannel = a.type === "CHANNEL";
      const bChannel = b.type === "CHANNEL";
      if (aChannel !== bChannel) return aChannel ? -1 : 1;
      if (aChannel) return a.order - b.order;
      return (
        (b.lastMessageAt?.getTime() ?? b.createdAt.getTime()) -
        (a.lastMessageAt?.getTime() ?? a.createdAt.getTime())
      );
    });
  return Promise.all(
    visible.map(async (conversation) => {
      const [last, read] = await Promise.all([
        prisma.message.findFirst({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { name: true } },
            poll: { select: { question: true } },
            attachments: {
              orderBy: { order: "asc" },
              take: 1,
              select: { kind: true, name: true },
            },
          },
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
        id: conversation.id,
        slug: conversationSlug(conversation),
        type: conversation.type,
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
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        last: last
          ? {
              authorName: last.author?.name ?? null,
              // Polls and attachment-only messages have an empty body —
              // preview a marker instead.
              preview: last.poll
                ? `📊 ${last.poll.question}`
                : last.body || attachmentMarker(last.attachments[0]),
              createdAt: last.createdAt.toISOString(),
            }
          : null,
      };
    }),
  );
}

const MAX_MENTIONS = 20;

/**
 * Scan a message body for "@Name" occurrences of conversation members and
 * return their offsets. Longest names match first so "@Anna Berg" wins over
 * "@Anna"; matches never overlap. Case-sensitive on purpose — the
 * autocomplete inserts the exact name.
 */
export function extractMentions(
  body: string,
  members: { id: string; name: string }[],
): { userId: string; offset: number; length: number }[] {
  if (!body.includes("@")) return [];
  const sorted = [...members]
    .filter((m) => m.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const taken: [number, number][] = [];
  const mentions: { userId: string; offset: number; length: number }[] = [];
  for (const member of sorted) {
    const needle = `@${member.name}`;
    let from = 0;
    while (mentions.length < MAX_MENTIONS) {
      const idx = body.indexOf(needle, from);
      if (idx === -1) break;
      from = idx + 1;
      const end = idx + needle.length;
      if (taken.some(([s2, e2]) => idx < e2 && end > s2)) continue;
      taken.push([idx, end]);
      mentions.push({ userId: member.id, offset: idx, length: needle.length });
    }
  }
  return mentions.sort((a, b) => a.offset - b.offset);
}

/** Locale-free preview marker for an attachment-only last message. */
function attachmentMarker(
  attachment?: { kind: "IMAGE" | "FILE" | "GIF"; name: string },
): string {
  if (!attachment) return "";
  if (attachment.kind === "GIF") return "GIF";
  if (attachment.kind === "IMAGE") return "📷";
  return `📎 ${attachment.name}`;
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
 * The viewer's muted conversations, for the review list in their profile —
 * the one place that answers "what did I silence, and when did I do that?".
 *
 * Access-filtered like every other read: a mute row that outlived the member's
 * access to a role-gated channel must not leak that channel's name back to
 * them. Returns [] when nothing is muted, which is the common case.
 */
export async function mutedConversations(
  viewer: Viewer,
  userId: string,
): Promise<{ id: string; slug: string; title: string }[]> {
  const rows = await prisma.conversationRead.findMany({
    where: { userId, muted: true },
    select: { conversationId: true },
  });
  if (rows.length === 0) return [];
  const mutedIds = new Set(rows.map((r) => r.conversationId));
  const conversations = await conversationsForViewer(viewer, userId);
  return conversations
    .filter((c) => mutedIds.has(c.id))
    .map((c) => ({
      id: c.id,
      slug: conversationSlug(c),
      title: conversationDisplayName(c, userId),
    }));
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
  const [members, mutedRows] = await Promise.all([
    conversationMembers(conversation),
    prisma.conversationRead.findMany({
      where: { conversationId: conversation.id, muted: true },
      select: { userId: true },
    }),
  ]);
  const muted = new Set(mutedRows.map((r) => r.userId));
  return members
    .filter((m) => m.id !== actorId && !online.has(m.id) && !muted.has(m.id))
    .map((m) => m.id);
}

export type SearchHitDTO = {
  messageId: string;
  conversationId: string;
  slug: string;
  conversationTitle: string;
  authorName: string | null;
  body: string;
  createdAt: string;
};

const SEARCH_LIMIT = 30;

/**
 * LIKE search over the maintained `searchText` column (JS locale-lowercased
 * at write time, so Æ/Ø/Å match — SQLite's own lower() is ASCII-only),
 * scoped to the viewer's conversations. Plain LIKE beats FTS5 here: no
 * unmanaged virtual tables for Prisma migrations to trip over, and the scan
 * is milliseconds at this community's volume.
 */
export async function searchMessages(
  viewer: Viewer,
  userId: string,
  query: string,
): Promise<SearchHitDTO[]> {
  const term = toSearchText(query.trim()).slice(0, 100);
  if (term.length < 2) return [];
  const conversations = await conversationsForViewer(viewer, userId);
  if (conversations.length === 0) return [];
  const ids = conversations.map((c) => c.id);
  const escaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`);

  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Message"
     WHERE "conversationId" IN (${placeholders})
       AND "deletedAt" IS NULL
       AND "searchText" LIKE ? ESCAPE '\\'
     ORDER BY "createdAt" DESC
     LIMIT ${SEARCH_LIMIT}`,
    ...ids,
    `%${escaped}%`,
  );
  if (rows.length === 0) return [];

  const titleById = new Map(
    conversations.map((c) => [c.id, conversationDisplayName(c, userId)]),
  );
  const slugById = new Map(ids.map((id) => [id, id]));
  for (const c of conversations) slugById.set(c.id, conversationSlug(c));

  const messages = await prisma.message.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true,
      conversationId: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return messages.map((m) => ({
    messageId: m.id,
    conversationId: m.conversationId,
    slug: slugById.get(m.conversationId) ?? m.conversationId,
    conversationTitle: titleById.get(m.conversationId) ?? "",
    authorName: m.author?.name ?? null,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));
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

/** Page size for history pagination and jump-to windows. */
export const MESSAGE_PAGE = 50;

/**
 * Messages older than a cursor message (exclusive), oldest-first, plus
 * whether more remain beyond them.
 */
export async function messagesBefore(conversationId: string, beforeId: string) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    cursor: { id: beforeId },
    skip: 1,
    take: MESSAGE_PAGE + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > MESSAGE_PAGE;
  const page = rows.slice(0, MESSAGE_PAGE).reverse().map(buildMessageDTO);
  return { messages: await enrichEventCounts(page), hasMore };
}

/** Messages newer than a cursor message (exclusive), oldest-first. */
export async function messagesAfter(conversationId: string, afterId: string) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    cursor: { id: afterId },
    skip: 1,
    take: MESSAGE_PAGE + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > MESSAGE_PAGE;
  const page = rows.slice(0, MESSAGE_PAGE).map(buildMessageDTO);
  return { messages: await enrichEventCounts(page), hasMore };
}

/**
 * A window of messages around one target message (for search results, quote
 * taps and notification deep links), oldest-first.
 */
export async function messagesAround(conversationId: string, messageId: string) {
  const target = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    include: messageInclude,
  });
  if (!target) return null;
  const half = Math.floor(MESSAGE_PAGE / 2);
  const [older, newer] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: messageId },
      skip: 1,
      take: half + 1,
      include: messageInclude,
    }),
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      cursor: { id: messageId },
      skip: 1,
      take: half + 1,
      include: messageInclude,
    }),
  ]);
  const hasOlder = older.length > half;
  const hasNewer = newer.length > half;
  const windowRows = [
    ...older.slice(0, half).reverse(),
    target,
    ...newer.slice(0, half),
  ].map(buildMessageDTO);
  return {
    messages: await enrichEventCounts(windowRows),
    hasOlder,
    hasNewer,
  };
}
