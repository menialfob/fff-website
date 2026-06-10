"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUpload, saveUpload } from "@/lib/storage";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // matches serverActions.bodySizeLimit

export async function uploadFile(formData: FormData) {
  const session = await requireSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "File is too large (max 200 MB)." };
  }

  const storedName = await saveUpload(file);
  await prisma.fileItem.create({
    data: {
      name: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById: session.user.id,
    },
  });
  revalidatePath("/files");
  return { ok: true };
}

export async function deleteFile(fileId: string) {
  const session = await requireSession();

  const file = await prisma.fileItem.findUnique({ where: { id: fileId } });
  if (!file) return { error: "File not found." };
  if (file.uploadedById !== session.user.id && session.user.role !== "ADMIN") {
    return { error: "You can only delete your own files." };
  }

  await prisma.fileItem.delete({ where: { id: fileId } });
  await deleteUpload(file.storedName);
  revalidatePath("/files");
  return { ok: true };
}
