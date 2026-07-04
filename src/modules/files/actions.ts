"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteUpload, saveUpload } from "@/lib/storage";
import { getDict } from "@/lib/i18n/server";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // matches serverActions.bodySizeLimit
const MAX_FOLDER_NAME = 100;

export async function uploadFile(formData: FormData) {
  const session = await requireSession();
  const t = await getDict();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t.errors.chooseFile };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: t.errors.fileTooLarge };
  }

  // Optional destination folder (uploads from a folder page).
  const rawFolderId = formData.get("folderId");
  let folderId: string | null = null;
  if (typeof rawFolderId === "string" && rawFolderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: rawFolderId },
    });
    if (!folder) return { error: t.errors.folderNotFound };
    folderId = folder.id;
  }

  const storedName = await saveUpload(file);
  const item = await prisma.fileItem.create({
    data: {
      name: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById: session.user.id,
      folderId,
    },
  });
  await logEvent({
    actorId: session.user.id,
    action: "file.upload",
    targetType: "file",
    targetId: item.id,
    meta: { name: file.name, size: file.size },
  });
  revalidatePath("/files");
  if (folderId) revalidatePath(`/files/${folderId}`);
  return { ok: true };
}

export async function deleteFile(fileId: string) {
  const session = await requireSession();
  const t = await getDict();

  const file = await prisma.fileItem.findUnique({ where: { id: fileId } });
  if (!file) return { error: t.errors.fileNotFound };
  if (file.uploadedById !== session.user.id && session.user.role !== "ADMIN") {
    return { error: t.errors.ownFilesOnly };
  }

  await prisma.fileItem.delete({ where: { id: fileId } });
  await deleteUpload(file.storedName);
  await logEvent({
    actorId: session.user.id,
    action: "file.delete",
    targetType: "file",
    targetId: fileId,
    meta: { name: file.name },
  });
  revalidatePath("/files");
  if (file.folderId) revalidatePath(`/files/${file.folderId}`);
  return { ok: true };
}

function validFolderName(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!name || name.length > MAX_FOLDER_NAME) return null;
  return name;
}

export async function createFolder(formData: FormData) {
  const session = await requireSession();
  const t = await getDict();

  const name = validFolderName(formData.get("name"));
  if (!name) return { error: t.errors.invalidInput };

  const folder = await prisma.folder.create({
    data: { name, createdById: session.user.id },
  });
  await logEvent({
    actorId: session.user.id,
    action: "folder.create",
    targetType: "folder",
    targetId: folder.id,
    meta: { name },
  });
  revalidatePath("/files");
  return { ok: true };
}

export async function renameFolder(folderId: string, formData: FormData) {
  const session = await requireSession();
  const t = await getDict();

  const name = validFolderName(formData.get("name"));
  if (!name) return { error: t.errors.invalidInput };

  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return { error: t.errors.folderNotFound };
  if (
    folder.createdById !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return { error: t.errors.ownFoldersOnly };
  }

  await prisma.folder.update({ where: { id: folderId }, data: { name } });
  await logEvent({
    actorId: session.user.id,
    action: "folder.rename",
    targetType: "folder",
    targetId: folderId,
    meta: { from: folder.name, to: name },
  });
  revalidatePath("/files");
  revalidatePath(`/files/${folderId}`);
  return { ok: true };
}

// Deleting a folder never deletes its files: the SetNull relation moves them
// back to the root of the files section.
export async function deleteFolder(folderId: string) {
  const session = await requireSession();
  const t = await getDict();

  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return { error: t.errors.folderNotFound };
  if (
    folder.createdById !== session.user.id &&
    session.user.role !== "ADMIN"
  ) {
    return { error: t.errors.ownFoldersOnly };
  }

  await prisma.folder.delete({ where: { id: folderId } });
  await logEvent({
    actorId: session.user.id,
    action: "folder.delete",
    targetType: "folder",
    targetId: folderId,
    meta: { name: folder.name },
  });
  revalidatePath("/files");
  return { ok: true };
}
