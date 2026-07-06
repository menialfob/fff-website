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
  canAccessChannel,
  enrichEventCounts,
  messageInclude,
  pushRecipients,
  summarizeReactions,
} from "./data";

type ActionResult = { ok?: true; error?: string };

const MAX_BODY = 4000;
const MAX_QUESTION = 200;
const MAX_OPTION = 100;
const MAX_EMOJI = 24;

function viewerOf(session: Session) {
  return { role: session.user.role, extraRoles: session.user.extraRoles };
}

/** Load a channel and confirm the session may use it, or return an error. */
async function channelGate(channelId: string, session: Session) {
  const t = await getDict();
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return { error: t.errors.channelNotFound as string };
  if (!canAccessChannel(channel, viewerOf(session))) {
    return { error: t.errors.notAuthorized as string };
  }
  return { channel };
}

export async function sendMessage(
  channelId: string,
  body: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await channelGate(channelId, session);
  if (gate.error) return { error: gate.error };
  const channel = gate.channel!;

  const text = body.trim();
  if (!text) return { error: t.errors.messageEmpty };
  if (text.length > MAX_BODY) return { error: t.errors.messageTooLong };

  const created = await prisma.channelMessage.create({
    data: { channelId, authorId: session.user.id, body: text },
    include: messageInclude,
  });
  const dto = buildMessageDTO(created);
  emitEvent({ type: "message", channelId, message: dto });

  // Notify members who aren't currently connected (online users got it live).
  const recipients = await pushRecipients(
    channel,
    session.user.id,
    onlineUserIds(),
  );
  await sendPushToUsers(recipients, {
    title: channel.name,
    body: `${session.user.name}: ${text}`.slice(0, 160),
    url: `/chat/${channel.key}`,
    tag: `chat-${channel.key}`,
  });

  return { ok: true };
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();

  const clean = emoji.trim();
  if (!clean || clean.length > MAX_EMOJI) return { error: t.errors.invalidInput };

  const message = await prisma.channelMessage.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, channel: { select: { requiredRole: true } } },
  });
  if (!message) return { error: t.errors.messageNotFound };
  if (!canAccessChannel(message.channel, viewerOf(session))) {
    return { error: t.errors.notAuthorized };
  }

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
    channelId: message.channelId,
    messageId,
    reactions: summarizeReactions(reactions),
  });

  return { ok: true };
}

export async function createPoll(
  channelId: string,
  question: string,
  options: string[],
  multiple: boolean,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await channelGate(channelId, session);
  if (gate.error) return { error: gate.error };
  const channel = gate.channel!;

  const q = question.trim();
  const opts = options
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((text) => text.slice(0, MAX_OPTION));
  if (!q || q.length > MAX_QUESTION) return { error: t.errors.invalidInput };
  if (opts.length < 2) return { error: t.errors.pollOptionsRequired };

  const message = await prisma.channelMessage.create({
    data: {
      channelId,
      authorId: session.user.id,
      body: "",
      poll: {
        create: {
          channelId,
          question: q,
          multiple,
          createdById: session.user.id,
          options: { create: opts.map((text, i) => ({ text, order: i })) },
        },
      },
    },
    include: messageInclude,
  });
  const dto = buildMessageDTO(message);
  emitEvent({ type: "message", channelId, message: dto });

  const recipients = await pushRecipients(
    channel,
    session.user.id,
    onlineUserIds(),
  );
  await sendPushToUsers(recipients, {
    title: channel.name,
    body: `📊 ${q}`.slice(0, 160),
    url: `/chat/${channel.key}`,
    tag: `chat-${channel.key}`,
  });

  return { ok: true };
}

/**
 * Share a calendar event (a specific instance date) into a channel as an event
 * card, and push everyone who isn't currently connected a notification that
 * deep-links straight to the event's signup page. This is the flow that beats
 * Messenger: recipients are already authenticated in the PWA, so the tap lands
 * on signup with full context instead of a dead private link.
 */
export async function shareEventToChat(
  eventId: string,
  date: string,
  channelId: string,
  note?: string,
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const gate = await channelGate(channelId, session);
  if (gate.error) return { error: gate.error };
  const channel = gate.channel!;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: t.errors.invalidInput };
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true },
  });
  if (!event) return { error: t.errors.eventNotFound };

  const created = await prisma.channelMessage.create({
    data: {
      channelId,
      authorId: session.user.id,
      body: (note ?? "").trim().slice(0, MAX_BODY),
      eventId,
      eventDate: date,
    },
    include: messageInclude,
  });
  const [dto] = await enrichEventCounts([buildMessageDTO(created)]);
  emitEvent({ type: "message", channelId, message: dto });

  const recipients = await pushRecipients(
    channel,
    session.user.id,
    onlineUserIds(),
  );
  await sendPushToUsers(recipients, {
    title: channel.name,
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
    include: {
      channel: { select: { requiredRole: true } },
      options: { select: { id: true } },
    },
  });
  if (!poll) return { error: t.errors.pollNotFound };
  if (!canAccessChannel(poll.channel, viewerOf(session))) {
    return { error: t.errors.notAuthorized };
  }
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
    channelId: poll.channelId,
    pollId,
    tallies: buildPollDTO(fresh).tallies,
  });

  return { ok: true };
}

/** Ephemeral typing ping — broadcast only, never stored. */
export async function sendTyping(channelId: string): Promise<void> {
  const session = await requireSession();
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { requiredRole: true },
  });
  if (!channel || !canAccessChannel(channel, viewerOf(session))) return;
  emitEvent({
    type: "typing",
    channelId,
    user: { id: session.user.id, name: session.user.name ?? "" },
  });
}

/** Move the viewer's read cursor for a channel to now (clears unread). */
export async function markChannelRead(channelId: string): Promise<void> {
  const session = await requireSession();
  await prisma.channelRead
    .upsert({
      where: { userId_channelId: { userId: session.user.id, channelId } },
      create: { userId: session.user.id, channelId },
      update: { lastReadAt: new Date() },
    })
    .catch(() => {});
}
