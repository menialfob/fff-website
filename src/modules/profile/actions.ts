"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { processAvatar } from "@/lib/images";
import { deleteUpload, saveProcessedUpload } from "@/lib/storage";

// Before processing; the stored webp is far smaller.
const MAX_AVATAR_BYTES = 15 * 1024 * 1024;

export async function updateAvatar(formData: FormData) {
  const session = await requireSession();
  const t = await getDict();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t.errors.avatarInvalid };
  }
  if (file.size > MAX_AVATAR_BYTES) return { error: t.errors.avatarTooLarge };
  if (!file.type.startsWith("image/")) return { error: t.errors.avatarInvalid };

  let processed: Buffer;
  try {
    processed = await processAvatar(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { error: t.errors.avatarInvalid };
  }
  const storedName = await saveProcessedUpload(processed, ".webp");

  const previous = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarStoredName: true },
  });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarStoredName: storedName, avatarUpdatedAt: new Date() },
  });
  if (previous?.avatarStoredName) await deleteUpload(previous.avatarStoredName);

  revalidatePath("/profile");
  return { ok: true };
}

export async function removeAvatar() {
  const session = await requireSession();
  const previous = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarStoredName: true },
  });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarStoredName: null, avatarUpdatedAt: new Date() },
  });
  if (previous?.avatarStoredName) await deleteUpload(previous.avatarStoredName);
  revalidatePath("/profile");
  return { ok: true };
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(500),
});

export async function updateProfile(formData: FormData) {
  const session = await requireSession();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) return { error: (await getDict()).errors.invalidInput };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name, bio: parsed.data.bio || null },
  });
  revalidatePath("/profile");
  return { ok: true };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function changePassword(formData: FormData) {
  const session = await requireSession();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: (await getDict()).errors.passwordTooShort };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  const valid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!valid) return { error: (await getDict()).errors.wrongCurrentPassword };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });
  return { ok: true };
}
