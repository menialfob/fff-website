"use server";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { sendPushToUsers } from "@/lib/push";
import { emitEvent, onlineUserIds } from "@/lib/realtime";
import type { Session } from "next-auth";
import {
  buildMessageDTO,
  buildPollDTO,
  canAccessConversation,
  conversationMembers,
  conversationMessages,
  conversationSlug,
  conversationSummaries,
  enrichEventCounts,
  extractMentions,
  messageInclude,
  messagesAfter,
  messagesAround,
  messagesBefore,
  pushRecipients,
  summarizeReactions,
  toSearchText,
  type ConversationSummaryDTO,
} from "./data";
import { fmt } from "@/lib/i18n";
import { avatarUrlFor } from "@/components/avatar";
import { deleteUpload, saveProcessedUpload } from "@/lib/storage";
import { processImageAttachment } from "@/lib/images";
import type { MessageDTO } from "@/lib/realtime";

type ActionResult = { ok?: true; error?: string };

const MAX_BODY = 4000;
const MAX_QUESTION = 200;
const MAX_OPTION = 100;
const MAX_EMOJI = 24;

function viewerOf(session: Session) {
  return { role: session.user.role, extraRoles: session.user.extraRoles };
}

/**
 * Load a conversation and confirm the session may use it, or return an error.
 * Membership is checked via a scoped include so one query covers both channel
 * role gates and DM/group membership.
 */
async function conversationGate(conversationId: string, session: Session) {
  const t = await getDict();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { where: { userId: session.user.id } } },
  });
  if (!conversation) return { error: t.errors.conversationNotFound as string };
  const isMember = conversation.members.length > 0;
  if (!canAccessConversation(conversation, viewerOf(session), isMember)) {
    return { error: t.errors.notAuthorized as string };
  }
  return { conversation };
}

/** The push title for activity in a conversation (DMs use the author name). */
function pushTitle(
  conversation: { type: string; name: string | null },
  authorName: string,
): string {
  if (conversation.type === "DM" || !conversation.name) return authorName;
  return conversation.name;
}

const MAX_ATTACHMENTS = 10;

export async function sendMessage(
  conversationId: string,
  body: string,
  clientId?: string,
  replyToId?: string,
  attachmentIds?: string[],
): Promise<ActionResult & { message?: MessageDTO }> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  const conversation = gate.conversation!;

  const text = body.trim();
  const wantedAttachments = [...new Set(attachmentIds ?? [])].slice(
    0,
    MAX_ATTACHMENTS,
  );
  if (!text && wantedAttachments.length === 0) {
    return { error: t.errors.messageEmpty };
  }
  if (text.length > MAX_BODY) return { error: t.errors.messageTooLong };

  // A quote must point at a message in the same conversation.
  if (replyToId) {
    const target = await prisma.message.findFirst({
      where: { id: replyToId, conversationId },
      select: { id: true },
    });
    if (!target) return { error: t.errors.messageNotFound };
  }

  // Claimable = uploaded by this user and not yet attached to any message.
  if (wantedAttachments.length > 0) {
    const claimable = await prisma.messageAttachment.count({
      where: {
        id: { in: wantedAttachments },
        uploadedById: session.user.id,
        messageId: null,
      },
    });
    if (claimable !== wantedAttachments.length) {
      return { error: t.errors.invalidInput };
    }
  }

  // Mentions are derived server-side by scanning for members' "@Name".
  const members = await conversationMembers(conversation);
  const mentions = text ? extractMentions(text, members) : [];

  const now = new Date();
  const created = await prisma.message.create({
    data: {
      conversationId,
      authorId: session.user.id,
      body: text,
      searchText: text ? toSearchText(text) : null,
      clientId: clientId?.slice(0, 64) || null,
      replyToId: replyToId || null,
      createdAt: now,
      mentions: { create: mentions },
    },
  });
  if (wantedAttachments.length > 0) {
    // Preserve the picker's ordering.
    await Promise.all(
      wantedAttachments.map((id, order) =>
        prisma.messageAttachment.update({
          where: { id },
          data: { messageId: created.id, order },
        }),
      ),
    );
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });
  const full = await prisma.message.findUniqueOrThrow({
    where: { id: created.id },
    include: messageInclude,
  });
  const dto = buildMessageDTO(full);
  emitEvent({ type: "message", conversationId, message: dto });

  // Notify members who aren't currently connected (online users got it live).
  // Mentioned members get a targeted notification instead of the generic one.
  const recipients = await pushRecipients(
    conversation,
    session.user.id,
    onlineUserIds(),
  );
  const slug = conversationSlug(conversation);
  const mentionedIds = new Set(mentions.map((m) => m.userId));
  const plainRecipients = recipients.filter((id) => !mentionedIds.has(id));
  const mentionRecipients = recipients.filter((id) => mentionedIds.has(id));
  const pushBody = text
    ? `${session.user.name}: ${text}`
    : `${session.user.name}: ${attachmentPreviewLabel(dto.attachments, t)}`;
  await sendPushToUsers(plainRecipients, {
    title: pushTitle(conversation, session.user.name ?? ""),
    body: pushBody.slice(0, 160),
    url: `/chat/${slug}`,
    tag: `chat-${slug}`,
  });
  if (mentionRecipients.length > 0) {
    await sendPushToUsers(mentionRecipients, {
      title: fmt(t.chat.mentionedYou, { name: session.user.name ?? "" }),
      body: text.slice(0, 160),
      url: `/chat/${slug}?m=${created.id}`,
      tag: `chat-${slug}`,
    });
  }

  return { ok: true, message: dto };
}

type AttachmentLite = { kind: "IMAGE" | "FILE" | "GIF"; name: string };

/** "📷 Billede" / "📎 fil.pdf" preview line for pushes and list previews. */
function attachmentPreviewLabel(
  attachments: AttachmentLite[],
  t: Awaited<ReturnType<typeof getDict>>,
): string {
  const first = attachments[0];
  if (!first) return "";
  if (first.kind === "GIF") return "GIF";
  if (first.kind === "IMAGE") {
    return attachments.length > 1
      ? `📷 ${fmtCount(t.chat.imageCountPreview, attachments.length)}`
      : `📷 ${t.chat.imagePreview}`;
  }
  return `📎 ${first.name}`;
}

function fmtCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

// Selected GIFs are stored locally so recipients never hotlink Tenor.
const MAX_GIF_BYTES = 8 * 1024 * 1024;

/**
 * Send a Tenor GIF: re-resolve the id server-side, download the full GIF,
 * store it like any attachment (thumb from the first frame), and post an
 * attachment-only message carrying it.
 */
export async function sendGif(
  conversationId: string,
  tenorId: string,
  clientId?: string,
): Promise<ActionResult & { message?: MessageDTO }> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  const conversation = gate.conversation!;

  const key = process.env.TENOR_API_KEY;
  const cleanId = tenorId.trim().slice(0, 50);
  if (!key || !cleanId) return { error: t.errors.gifUnavailable };

  let gifBytes: Buffer;
  let gifName: string;
  try {
    const postsUrl = new URL("https://tenor.googleapis.com/v2/posts");
    postsUrl.searchParams.set("key", key);
    postsUrl.searchParams.set("client_key", "fff-website");
    postsUrl.searchParams.set("ids", cleanId);
    postsUrl.searchParams.set("media_filter", "gif");
    const meta = await fetch(postsUrl, { signal: AbortSignal.timeout(8000) });
    if (!meta.ok) throw new Error(String(meta.status));
    const data = (await meta.json()) as {
      results?: {
        media_formats?: { gif?: { url: string } };
        content_description?: string;
      }[];
    };
    const gifUrl = data.results?.[0]?.media_formats?.gif?.url;
    if (!gifUrl) throw new Error("no-media");
    const media = await fetch(gifUrl, { signal: AbortSignal.timeout(15000) });
    if (!media.ok) throw new Error(String(media.status));
    const bytes = Buffer.from(await media.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_GIF_BYTES) {
      throw new Error("size");
    }
    gifBytes = bytes;
    gifName = `${(data.results?.[0]?.content_description ?? "gif").slice(0, 80)}.gif`;
  } catch {
    return { error: t.errors.gifUnavailable };
  }

  const processed = await processImageAttachment(gifBytes);
  const storedName = await saveProcessedUpload(gifBytes, ".gif");
  const thumbName = processed
    ? await saveProcessedUpload(processed.thumb, ".webp")
    : null;

  const now = new Date();
  const created = await prisma.message.create({
    data: {
      conversationId,
      authorId: session.user.id,
      body: "",
      clientId: clientId?.slice(0, 64) || null,
      createdAt: now,
      attachments: {
        create: {
          uploadedById: session.user.id,
          kind: "GIF",
          name: gifName,
          storedName,
          thumbName,
          mimeType: "image/gif",
          size: gifBytes.byteLength,
          width: processed?.width ?? null,
          height: processed?.height ?? null,
          blurData: processed?.blurData ?? null,
        },
      },
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });
  const full = await prisma.message.findUniqueOrThrow({
    where: { id: created.id },
    include: messageInclude,
  });
  const dto = buildMessageDTO(full);
  emitEvent({ type: "message", conversationId, message: dto });

  const recipients = await pushRecipients(
    conversation,
    session.user.id,
    onlineUserIds(),
  );
  const slug = conversationSlug(conversation);
  await sendPushToUsers(recipients, {
    title: pushTitle(conversation, session.user.name ?? ""),
    body: `${session.user.name}: GIF`.slice(0, 160),
    url: `/chat/${slug}`,
    tag: `chat-${slug}`,
  });

  return { ok: true, message: dto };
}

/** Edit your own message's text; broadcasts the updated message. */
export async function editMessage(
  messageId: string,
  body: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();

  const text = body.trim();
  if (!text) return { error: t.errors.messageEmpty };
  if (text.length > MAX_BODY) return { error: t.errors.messageTooLong };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      authorId: true,
      deletedAt: true,
      poll: { select: { id: true } },
    },
  });
  if (!message) return { error: t.errors.messageNotFound };
  const gate = await conversationGate(message.conversationId, session);
  if (gate.error) return { error: gate.error };
  // Author-only; tombstones and poll carrier messages are not editable.
  if (message.authorId !== session.user.id || message.deletedAt || message.poll) {
    return { error: t.errors.messageNotEditable };
  }

  // Recompute mentions against the new body (no push — edits are quiet).
  const members = await conversationMembers(gate.conversation!);
  const mentions = extractMentions(text, members);
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      body: text,
      searchText: toSearchText(text),
      editedAt: new Date(),
      mentions: { deleteMany: {}, create: mentions },
    },
    include: messageInclude,
  });
  const [dto] = await enrichEventCounts([buildMessageDTO(updated)]);
  emitEvent({
    type: "message-updated",
    conversationId: message.conversationId,
    message: dto,
  });
  return { ok: true };
}

/**
 * Delete your own message. WhatsApp-style tombstone: the row stays (so reply
 * quotes keep an anchor) but its content, reactions and poll are removed.
 */
export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      authorId: true,
      deletedAt: true,
    },
  });
  if (!message) return { error: t.errors.messageNotFound };
  const gate = await conversationGate(message.conversationId, session);
  if (gate.error) return { error: gate.error };
  const isSiteAdmin = session.user.role === "ADMIN";
  if (message.authorId !== session.user.id && !isSiteAdmin) {
    return { error: t.errors.notAuthorized };
  }
  if (message.deletedAt) return { ok: true };

  // Collect attachment files before the rows disappear.
  const attachments = await prisma.messageAttachment.findMany({
    where: { messageId },
    select: { storedName: true, thumbName: true },
  });
  await prisma.$transaction([
    prisma.messageReaction.deleteMany({ where: { messageId } }),
    prisma.poll.deleteMany({ where: { messageId } }),
    prisma.messageAttachment.deleteMany({ where: { messageId } }),
    prisma.message.update({
      where: { id: messageId },
      data: {
        body: "",
        searchText: null,
        deletedAt: new Date(),
        eventId: null,
        eventDate: null,
      },
    }),
  ]);
  for (const a of attachments) {
    await deleteUpload(a.storedName);
    if (a.thumbName) await deleteUpload(a.thumbName);
  }
  const fresh = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: messageInclude,
  });
  emitEvent({
    type: "message-updated",
    conversationId: message.conversationId,
    message: buildMessageDTO(fresh),
  });
  return { ok: true };
}

/** Page of messages older than `beforeId` (scroll-up history). */
export async function olderMessages(
  conversationId: string,
  beforeId: string,
): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return { messages: [], hasMore: false };
  return messagesBefore(conversationId, beforeId);
}

/** Page of messages newer than `afterId` (filling down after a jump). */
export async function newerMessages(
  conversationId: string,
  afterId: string,
): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return { messages: [], hasMore: false };
  return messagesAfter(conversationId, afterId);
}

/** Window around one message (search results, quote taps, deep links). */
export async function aroundMessages(
  conversationId: string,
  messageId: string,
): Promise<{
  messages: MessageDTO[];
  hasOlder: boolean;
  hasNewer: boolean;
} | null> {
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return null;
  return messagesAround(conversationId, messageId);
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();

  const clean = emoji.trim();
  if (!clean || clean.length > MAX_EMOJI) return { error: t.errors.invalidInput };

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });
  if (!message) return { error: t.errors.messageNotFound };
  const gate = await conversationGate(message.conversationId, session);
  if (gate.error) return { error: gate.error };

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId: session.user.id,
        emoji: clean,
      },
    },
  });
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({
      data: { messageId, userId: session.user.id, emoji: clean },
    });
  }

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });
  emitEvent({
    type: "reaction",
    conversationId: message.conversationId,
    messageId,
    reactions: summarizeReactions(reactions),
  });

  return { ok: true };
}

export async function createPoll(
  conversationId: string,
  question: string,
  options: string[],
  multiple: boolean,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  const conversation = gate.conversation!;

  const q = question.trim();
  const opts = options
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((text) => text.slice(0, MAX_OPTION));
  if (!q || q.length > MAX_QUESTION) return { error: t.errors.invalidInput };
  if (opts.length < 2) return { error: t.errors.pollOptionsRequired };

  const now = new Date();
  const message = await prisma.message.create({
    data: {
      conversationId,
      authorId: session.user.id,
      body: "",
      createdAt: now,
      poll: {
        create: {
          conversationId,
          question: q,
          multiple,
          createdById: session.user.id,
          options: { create: opts.map((text, i) => ({ text, order: i })) },
        },
      },
    },
    include: messageInclude,
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });
  const dto = buildMessageDTO(message);
  emitEvent({ type: "message", conversationId, message: dto });

  const recipients = await pushRecipients(
    conversation,
    session.user.id,
    onlineUserIds(),
  );
  const slug = conversationSlug(conversation);
  await sendPushToUsers(recipients, {
    title: pushTitle(conversation, session.user.name ?? ""),
    body: `📊 ${q}`.slice(0, 160),
    url: `/chat/${slug}`,
    tag: `chat-${slug}`,
  });

  return { ok: true };
}

/**
 * Share a calendar event (a specific instance date) into a conversation as an
 * event card, and push everyone who isn't currently connected a notification
 * that deep-links straight to the event's signup page. This is the flow that
 * beats Messenger: recipients are already authenticated in the PWA, so the
 * tap lands on signup with full context instead of a dead private link.
 */
export async function shareEventToChat(
  eventId: string,
  date: string,
  conversationId: string,
  note?: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  const conversation = gate.conversation!;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: t.errors.invalidInput };
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) return { error: t.errors.eventNotFound };

  const now = new Date();
  const noteText = (note ?? "").trim().slice(0, MAX_BODY);
  const created = await prisma.message.create({
    data: {
      conversationId,
      authorId: session.user.id,
      body: noteText,
      searchText: noteText ? toSearchText(noteText) : null,
      createdAt: now,
      eventId,
      eventDate: date,
    },
    include: messageInclude,
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: now },
  });
  const [dto] = await enrichEventCounts([buildMessageDTO(created)]);
  emitEvent({ type: "message", conversationId, message: dto });

  const recipients = await pushRecipients(
    conversation,
    session.user.id,
    onlineUserIds(),
  );
  await sendPushToUsers(recipients, {
    title: pushTitle(conversation, session.user.name ?? ""),
    body: `📅 ${event.title}`.slice(0, 160),
    url: `/calendar/${eventId}?d=${date}`,
    tag: `event-${eventId}-${date}`,
  });

  return { ok: true };
}

export async function votePoll(
  pollId: string,
  optionId: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { options: { select: { id: true } } },
  });
  if (!poll) return { error: t.errors.pollNotFound };
  const gate = await conversationGate(poll.conversationId, session);
  if (gate.error) return { error: gate.error };
  if (poll.closesAt && poll.closesAt.getTime() < Date.now()) {
    return { error: t.errors.pollClosed };
  }
  if (!poll.options.some((o) => o.id === optionId)) {
    return { error: t.errors.invalidInput };
  }

  const optionIds = poll.options.map((o) => o.id);
  const userVotes = await prisma.pollVote.findMany({
    where: { userId: session.user.id, optionId: { in: optionIds } },
  });
  const alreadyThis = userVotes.find((v) => v.optionId === optionId);

  if (poll.multiple) {
    if (alreadyThis) {
      await prisma.pollVote.delete({ where: { id: alreadyThis.id } });
    } else {
      await prisma.pollVote.create({
        data: { optionId, userId: session.user.id },
      });
    }
  } else {
    // Single choice: tapping the current pick clears it, otherwise replace.
    const clearOnly = alreadyThis && userVotes.length === 1;
    if (userVotes.length > 0) {
      await prisma.pollVote.deleteMany({
        where: { id: { in: userVotes.map((v) => v.id) } },
      });
    }
    if (!clearOnly) {
      await prisma.pollVote.create({
        data: { optionId, userId: session.user.id },
      });
    }
  }

  const fresh = await prisma.poll.findUniqueOrThrow({
    where: { id: pollId },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: { votes: { select: { userId: true } } },
      },
    },
  });
  emitEvent({
    type: "poll",
    conversationId: poll.conversationId,
    pollId,
    tallies: buildPollDTO(fresh).tallies,
  });

  return { ok: true };
}

/**
 * Re-fetch a conversation's latest messages. Used by the client to backfill
 * after the app returns to the foreground (the SSE stream is suspended while
 * backgrounded, so messages that arrived — e.g. the one a push announced —
 * were missed).
 */
export async function recentMessages(
  conversationId: string,
): Promise<MessageDTO[]> {
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return [];
  return conversationMessages(conversationId);
}

/** Ephemeral typing ping — broadcast only, never stored. */
export async function sendTyping(conversationId: string): Promise<void> {
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error) return;
  emitEvent({
    type: "typing",
    conversationId,
    user: { id: session.user.id, name: session.user.name ?? "" },
  });
}

/**
 * Fresh conversation summaries for the viewer — the live conversation list
 * refetches through this after membership/metadata events.
 */
export async function listConversationSummaries(): Promise<
  ConversationSummaryDTO[]
> {
  const session = await requireSession();
  return conversationSummaries(viewerOf(session), session.user.id);
}

/**
 * Active members that can be added to a group (admins' add-member picker):
 * everyone active who isn't already in it.
 */
export async function addableMembers(
  conversationId: string,
): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  const session = await requireSession();
  const gate = await conversationGate(conversationId, session);
  if (gate.error || gate.conversation!.type !== "GROUP") return [];
  // The gate only loads the caller's own membership row; the exclusion set
  // needs the full member list.
  const memberRows = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const memberIds = new Set(memberRows.map((m) => m.userId));
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      avatarStoredName: true,
      avatarUpdatedAt: true,
    },
    orderBy: { name: "asc" },
  });
  return users
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, avatarUrl: avatarUrlFor(u) }));
}

/** Move the viewer's read cursor for a conversation to now (clears unread). */
export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  const session = await requireSession();
  const now = new Date();
  try {
    await prisma.conversationRead.upsert({
      where: {
        userId_conversationId: { userId: session.user.id, conversationId },
      },
      create: { userId: session.user.id, conversationId, lastReadAt: now },
      update: { lastReadAt: now },
    });
  } catch {
    return;
  }
  emitEvent({
    type: "read",
    conversationId,
    userId: session.user.id,
    lastReadAt: now.toISOString(),
  });
}
