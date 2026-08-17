"use server";

import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { emitEvent } from "@/lib/realtime";
import type { Session } from "next-auth";

type ActionResult = { ok?: true; error?: string; conversationId?: string };

const MAX_GROUP_NAME = 100;
const MAX_GROUP_MEMBERS = 50;

/** Canonical DM dedupe key for a pair of users, order-independent. */
function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function emitConversation(
  conversationId: string,
  kind: "created" | "updated" | "member-added" | "member-removed" | "deleted",
  memberIds: string[],
): void {
  emitEvent({ type: "conversation", conversationId, kind, memberIds });
}

/** Load a group the session belongs to, or an error. */
async function groupGate(conversationId: string, session: Session) {
  const t = await getDict();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conversation || conversation.type !== "GROUP") {
    return { error: t.errors.conversationNotFound as string };
  }
  const me = conversation.members.find((m) => m.userId === session.user.id);
  if (!me) return { error: t.errors.notAuthorized as string };
  return { conversation, me, t };
}

/**
 * Open (or create) the 1:1 DM between the session user and another member.
 * Exactly one DM exists per pair — a concurrent create loses the unique race
 * on dmKey and returns the winner's conversation.
 */
export async function createDm(otherUserId: string): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const me = session.user.id;
  if (otherUserId === me) return { error: t.errors.invalidInput };

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, isActive: true },
  });
  if (!other || !other.isActive) return { error: t.errors.invalidInput };

  const dmKey = dmKeyFor(me, otherUserId);
  const existing = await prisma.conversation.findUnique({ where: { dmKey } });
  if (existing) return { ok: true, conversationId: existing.id };

  try {
    const created = await prisma.conversation.create({
      data: {
        type: "DM",
        dmKey,
        createdById: me,
        members: {
          create: [{ userId: me }, { userId: otherUserId }],
        },
      },
    });
    emitConversation(created.id, "created", [me, otherUserId]);
    return { ok: true, conversationId: created.id };
  } catch (e) {
    // Unique(dmKey) race: someone opened the same DM concurrently.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await prisma.conversation.findUnique({ where: { dmKey } });
      if (winner) return { ok: true, conversationId: winner.id };
    }
    throw e;
  }
}

/** Create a named group with the chosen members; the creator is admin. */
export async function createGroup(
  name: string,
  memberIds: string[],
): Promise<ActionResult> {
  const t = await getDict();
  const session = await requireSession();
  const me = session.user.id;

  const groupName = name.trim().slice(0, MAX_GROUP_NAME);
  if (!groupName) return { error: t.errors.groupNameRequired };

  const others = [...new Set(memberIds)].filter((id) => id !== me);
  if (others.length === 0) return { error: t.errors.membersRequired };
  if (others.length > MAX_GROUP_MEMBERS) return { error: t.errors.invalidInput };

  const validOthers = await prisma.user.findMany({
    where: { id: { in: others }, isActive: true },
    select: { id: true },
  });
  if (validOthers.length !== others.length) {
    return { error: t.errors.invalidInput };
  }

  const created = await prisma.conversation.create({
    data: {
      type: "GROUP",
      name: groupName,
      createdById: me,
      members: {
        create: [
          { userId: me, isAdmin: true },
          ...others.map((userId) => ({ userId })),
        ],
      },
    },
  });
  emitConversation(created.id, "created", [me, ...others]);
  return { ok: true, conversationId: created.id };
}

/** Rename a group (admins only). */
export async function renameGroup(
  conversationId: string,
  name: string,
): Promise<ActionResult> {
  const session = await requireSession();
  const gate = await groupGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  if (!gate.me!.isAdmin) return { error: gate.t!.errors.notGroupAdmin };

  const groupName = name.trim().slice(0, MAX_GROUP_NAME);
  if (!groupName) return { error: gate.t!.errors.groupNameRequired };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { name: groupName },
  });
  emitConversation(
    conversationId,
    "updated",
    gate.conversation!.members.map((m) => m.userId),
  );
  return { ok: true };
}

/** Add members to a group (admins only). */
export async function addMembers(
  conversationId: string,
  userIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();
  const gate = await groupGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  if (!gate.me!.isAdmin) return { error: gate.t!.errors.notGroupAdmin };

  const existing = new Set(gate.conversation!.members.map((m) => m.userId));
  const toAdd = [...new Set(userIds)].filter((id) => !existing.has(id));
  if (toAdd.length === 0) return { ok: true };
  if (existing.size + toAdd.length > MAX_GROUP_MEMBERS + 1) {
    return { error: gate.t!.errors.invalidInput };
  }

  const valid = await prisma.user.findMany({
    where: { id: { in: toAdd }, isActive: true },
    select: { id: true },
  });
  if (valid.length !== toAdd.length) return { error: gate.t!.errors.invalidInput };

  await prisma.conversationMember.createMany({
    data: toAdd.map((userId) => ({ conversationId, userId })),
  });
  emitConversation(conversationId, "member-added", [
    ...existing,
    ...toAdd,
  ]);
  return { ok: true };
}

/** Remove a member from a group (admins only; use leaveGroup for yourself). */
export async function removeMember(
  conversationId: string,
  userId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  const gate = await groupGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  if (!gate.me!.isAdmin) return { error: gate.t!.errors.notGroupAdmin };
  if (userId === session.user.id) return { error: gate.t!.errors.invalidInput };

  const target = gate.conversation!.members.find((m) => m.userId === userId);
  if (!target) return { ok: true };

  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId } },
  });
  emitConversation(
    conversationId,
    "member-removed",
    gate.conversation!.members.filter((m) => m.userId !== userId).map((m) => m.userId),
  );
  return { ok: true };
}

/**
 * Leave a group. If the last admin leaves, the longest-standing remaining
 * member becomes admin; if the last member leaves, the group is deleted.
 */
export async function leaveGroup(conversationId: string): Promise<ActionResult> {
  const session = await requireSession();
  const gate = await groupGate(conversationId, session);
  if (gate.error) return { error: gate.error };
  const me = session.user.id;

  const remaining = gate.conversation!.members.filter((m) => m.userId !== me);
  await prisma.conversationMember.delete({
    where: { conversationId_userId: { conversationId, userId: me } },
  });

  if (remaining.length === 0) {
    await prisma.conversation.delete({ where: { id: conversationId } });
    emitConversation(conversationId, "deleted", []);
    return { ok: true };
  }

  if (gate.me!.isAdmin && !remaining.some((m) => m.isAdmin)) {
    const successor = [...remaining].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )[0];
    await prisma.conversationMember.update({
      where: {
        conversationId_userId: { conversationId, userId: successor.userId },
      },
      data: { isAdmin: true },
    });
  }
  emitConversation(
    conversationId,
    "member-removed",
    remaining.map((m) => m.userId),
  );
  return { ok: true };
}
