"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logEvent } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n";
import { notifyMembers } from "@/lib/notify";
import {
  isBestyrelseTitle,
  isExtraRole,
  type BestyrelseTitle,
  type ExtraRole,
} from "@/lib/roles";
import { broadcastRoleChannelMembership } from "@/modules/chat/data";

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function createUser(formData: FormData) {
  const session = await requireAdmin();
  const t = await getDict();

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: t.errors.invalidPassword };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: t.errors.userExists };

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: parsed.data.role,
    },
  });
  await logEvent({
    actorId: session.user.id,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    meta: { targetName: user.name },
  });
  // Everyone but the admin who created the account gets the news — including
  // the new member, who has no device subscribed yet, so it reaches nobody's
  // phone twice.
  await notifyMembers({
    actorId: session.user.id,
    section: "members",
    title: t.modules.members.label,
    body: fmt(t.push.newMember, { name: user.name }),
    url: "/members",
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteUser(userId: string) {
  const session = await requireAdmin();
  const t = await getDict();
  if (userId === session.user.id) {
    return { error: t.errors.cannotDeleteSelf };
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t.errors.userNotFound };

  await prisma.user.delete({ where: { id: userId } });
  await logEvent({
    actorId: session.user.id,
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    meta: { targetName: user.name },
  });
  revalidatePath("/admin");
  return { ok: true };
}

const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function renameUser(userId: string, formData: FormData) {
  const session = await requireAdmin();
  const t = await getDict();

  const parsed = renameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: t.errors.invalidInput };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t.errors.userNotFound };

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name },
  });
  await logEvent({
    actorId: session.user.id,
    action: "user.rename",
    targetType: "user",
    targetId: userId,
    meta: { targetName: user.name, newName: parsed.data.name },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserAdmin(userId: string, isAdmin: boolean) {
  const session = await requireAdmin();
  const t = await getDict();
  if (userId === session.user.id && !isAdmin) {
    return { error: t.errors.cannotDemoteSelf };
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t.errors.userNotFound };

  await prisma.user.update({
    where: { id: userId },
    data: { role: isAdmin ? "ADMIN" : "MEMBER" },
  });
  await logEvent({
    actorId: session.user.id,
    action: isAdmin ? "user.promote" : "user.demote",
    targetType: "user",
    targetId: userId,
    meta: { targetName: user.name },
  });
  revalidatePath("/admin");
  return { ok: true };
}

const resetPasswordSchema = z.object({ password: z.string().min(8).max(200) });

export async function resetUserPassword(userId: string, formData: FormData) {
  const session = await requireAdmin();
  const t = await getDict();

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: t.errors.invalidPassword };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t.errors.userNotFound };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) },
  });
  // Never put the password itself in the log meta.
  await logEvent({
    actorId: session.user.id,
    action: "user.passwordReset",
    targetType: "user",
    targetId: userId,
    meta: { targetName: user.name },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean) {
  const session = await requireAdmin();
  const t = await getDict();
  if (userId === session.user.id && !active) {
    return { error: t.errors.cannotDeactivateSelf };
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t.errors.userNotFound };

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: active },
  });
  await logEvent({
    actorId: session.user.id,
    action: active ? "user.reactivate" : "user.deactivate",
    targetType: "user",
    targetId: userId,
    meta: { targetName: user.name },
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function setExtraRole(
  userId: string,
  role: ExtraRole,
  granted: boolean,
) {
  const session = await requireAdmin();
  const t = await getDict();
  if (!isExtraRole(role)) return { error: t.errors.invalidInput };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: t.errors.userNotFound };

  if (granted) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role },
      update: {},
    });
  } else {
    await prisma.userRole.deleteMany({ where: { userId, role } });
  }
  // A role-gated chat channel has no member rows — the role is the
  // membership — so granting or revoking one changes who is in it. Tell open
  // clients, or the channel would only appear/disappear on their next reload.
  await broadcastRoleChannelMembership(role, granted);
  await logEvent({
    actorId: session.user.id,
    action: granted ? "user.grantRole" : "user.revokeRole",
    targetType: "user",
    targetId: userId,
    meta: { targetName: user.name, role },
  });
  revalidatePath("/admin");
  revalidatePath("/members");
  return { ok: true };
}

export async function setBestyrelseTitle(
  userId: string,
  title: BestyrelseTitle | null,
) {
  const session = await requireAdmin();
  const t = await getDict();
  if (title !== null && !isBestyrelseTitle(title)) {
    return { error: t.errors.invalidInput };
  }

  const roleRow = await prisma.userRole.findUnique({
    where: { userId_role: { userId, role: "BESTYRELSE" } },
    include: { user: { select: { name: true } } },
  });
  if (!roleRow) return { error: t.errors.titleRequiresBestyrelse };

  let previousHolderName: string | null = null;
  if (title) {
    const previous = await prisma.userRole.findUnique({
      where: { title },
      include: { user: { select: { name: true } } },
    });
    if (previous?.userId === userId) return { ok: true }; // already holds it
    previousHolderName = previous?.user.name ?? null;

    // Elections move a title in one step: clear it from the previous holder
    // and assign it atomically so the unique constraint is never violated.
    await prisma.$transaction([
      prisma.userRole.updateMany({
        where: { title },
        data: { title: null },
      }),
      prisma.userRole.update({
        where: { userId_role: { userId, role: "BESTYRELSE" } },
        data: { title },
      }),
    ]);
  } else {
    if (!roleRow.title) return { ok: true }; // nothing to clear
    await prisma.userRole.update({
      where: { userId_role: { userId, role: "BESTYRELSE" } },
      data: { title: null },
    });
  }

  await logEvent({
    actorId: session.user.id,
    action: title
      ? previousHolderName
        ? "user.moveTitle"
        : "user.setTitle"
      : "user.clearTitle",
    targetType: "user",
    targetId: userId,
    meta: {
      targetName: roleRow.user.name,
      title: title ?? roleRow.title,
      ...(previousHolderName ? { previousHolderName } : {}),
    },
  });
  revalidatePath("/admin");
  revalidatePath("/members");
  return { ok: true };
}
