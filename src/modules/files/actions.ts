"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n";
import { notifyMembers } from "@/lib/notify";

const MAX_FOLDER_NAME = 100;
const MAX_FILE_NAME = 200;
/** How deep the folder tree may go, counting the root listing as level 0. */
const MAX_DEPTH = 10;

type Result = { error?: string; ok?: boolean; message?: string };

/**
 * Who may do what, decided once here:
 *  - moving and renaming is open to every member. This is a shared drive for a
 *    small trusted club, and tidying it up should not require being whoever
 *    happened to upload the file.
 *  - deleting is limited to the uploader (or an admin), because there is no
 *    undo.
 *  - ATTACHMENT folders belong to the calendar or the forum and are never
 *    editable from here at all.
 */

function revalidateFolder(folderId: string | null | undefined) {
  revalidatePath("/files");
  if (folderId) revalidatePath(`/files/${folderId}`);
}

/**
 * Names are display text: they are shown in listings and echoed in a
 * Content-Disposition header, and never used to address storage. Strip path
 * separators and control characters anyway so neither can be smuggled through.
 */
function validName(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/[\\/\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!name || name.length > max) return null;
  return name;
}

/* --- files ----------------------------------------------------------------- */

export async function renameFile(
  fileId: string,
  formData: FormData,
): Promise<Result> {
  await requireSession();
  const t = await getDict();

  const name = validName(formData.get("name"), MAX_FILE_NAME);
  if (!name) return { error: t.errors.invalidFileName };

  const file = await prisma.fileItem.findUnique({
    where: { id: fileId },
    select: { id: true, folderId: true },
  });
  if (!file) return { error: t.errors.fileNotFound };

  await prisma.fileItem.update({ where: { id: fileId }, data: { name } });
  revalidateFolder(file.folderId);
  return { ok: true };
}

export async function moveFiles(
  fileIds: string[],
  folderId: string | null,
): Promise<Result> {
  await requireSession();
  const t = await getDict();
  if (fileIds.length === 0) return { error: t.errors.nothingSelected };

  if (folderId) {
    const target = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true },
    });
    if (!target) return { error: t.errors.folderNotFound };
  }

  const files = await prisma.fileItem.findMany({
    where: { id: { in: fileIds } },
    select: { folderId: true },
  });
  await prisma.fileItem.updateMany({
    where: { id: { in: fileIds } },
    data: { folderId },
  });

  for (const from of new Set(files.map((f) => f.folderId))) {
    revalidateFolder(from);
  }
  revalidateFolder(folderId);
  return { ok: true };
}

/**
 * Deletes what the member is allowed to delete and reports the rest, rather
 * than refusing a whole selection because one file belongs to someone else.
 */
export async function deleteFiles(fileIds: string[]): Promise<Result> {
  const session = await requireSession();
  const t = await getDict();
  if (fileIds.length === 0) return { error: t.errors.nothingSelected };

  const files = await prisma.fileItem.findMany({
    where: { id: { in: fileIds } },
    select: {
      id: true,
      name: true,
      storedName: true,
      thumbName: true,
      folderId: true,
      uploadedById: true,
    },
  });
  if (files.length === 0) return { error: t.errors.fileNotFound };

  const isAdmin = session.user.role === "ADMIN";
  const allowed = files.filter(
    (f) => isAdmin || f.uploadedById === session.user.id,
  );
  const skipped = files.length - allowed.length;
  if (allowed.length === 0) return { error: t.errors.ownFilesOnly };

  await prisma.fileItem.deleteMany({
    where: { id: { in: allowed.map((f) => f.id) } },
  });
  for (const file of allowed) {
    await deleteObject(file.storedName);
    if (file.thumbName) await deleteObject(file.thumbName);
    await logEvent({
      actorId: session.user.id,
      action: "file.delete",
      targetType: "file",
      targetId: file.id,
      meta: { name: file.name },
    });
  }

  for (const folderId of new Set(allowed.map((f) => f.folderId))) {
    revalidateFolder(folderId);
  }
  return {
    ok: true,
    message: skipped
      ? fmt(t.files.deletedSome, { count: allowed.length, skipped })
      : undefined,
  };
}

/**
 * One push for a whole batch, called by the uploader once its queue drains —
 * twelve holiday photos should raise one notification, not twelve.
 */
export async function notifyUploads(
  folderId: string | null,
  count: number,
  firstName: string,
): Promise<Result> {
  const session = await requireSession();
  const t = await getDict();
  if (count < 1) return { ok: true };

  await notifyMembers({
    actorId: session.user.id,
    section: "files",
    title: t.modules.files.label,
    body:
      count === 1
        ? fmt(t.push.newFile, {
            name: session.user.name ?? "",
            file: firstName,
          })
        : fmt(t.push.newFiles, { name: session.user.name ?? "", count }),
    url: folderId ? `/files/${folderId}` : "/files",
  });
  revalidateFolder(folderId);
  return { ok: true };
}

/* --- folders --------------------------------------------------------------- */

/** Ids from a folder up to the root, nearest first. Also the depth check. */
async function ancestorsOf(folderId: string): Promise<string[]> {
  const chain: string[] = [];
  let current: string | null = folderId;
  while (current && chain.length <= MAX_DEPTH + 1) {
    const folder: { parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
    if (!folder) break;
    chain.push(current);
    current = folder.parentId;
  }
  return chain;
}

export async function createFolder(formData: FormData): Promise<Result> {
  const session = await requireSession();
  const t = await getDict();

  const name = validName(formData.get("name"), MAX_FOLDER_NAME);
  if (!name) return { error: t.errors.invalidFolderName };

  const rawParent = formData.get("parentId");
  let parentId: string | null = null;
  if (typeof rawParent === "string" && rawParent) {
    const parent = await prisma.folder.findUnique({
      where: { id: rawParent },
      select: { id: true, kind: true },
    });
    if (!parent) return { error: t.errors.folderNotFound };
    if (parent.kind === "ATTACHMENT") {
      return { error: t.errors.attachedFolderLocked };
    }
    if ((await ancestorsOf(parent.id)).length >= MAX_DEPTH) {
      return { error: fmt(t.errors.folderTooDeep, { count: MAX_DEPTH }) };
    }
    parentId = parent.id;
  }

  const folder = await prisma.folder.create({
    data: { name, parentId, createdById: session.user.id },
  });
  await logEvent({
    actorId: session.user.id,
    action: "folder.create",
    targetType: "folder",
    targetId: folder.id,
    meta: { name },
  });
  revalidateFolder(parentId);
  return { ok: true };
}

export async function renameFolder(
  folderId: string,
  formData: FormData,
): Promise<Result> {
  const session = await requireSession();
  const t = await getDict();

  const name = validName(formData.get("name"), MAX_FOLDER_NAME);
  if (!name) return { error: t.errors.invalidFolderName };

  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return { error: t.errors.folderNotFound };
  if (folder.kind === "ATTACHMENT") {
    return { error: t.errors.attachedFolderLocked };
  }

  await prisma.folder.update({ where: { id: folderId }, data: { name } });
  await logEvent({
    actorId: session.user.id,
    action: "folder.rename",
    targetType: "folder",
    targetId: folderId,
    meta: { from: folder.name, to: name },
  });
  revalidateFolder(folder.parentId);
  revalidatePath(`/files/${folderId}`);
  return { ok: true };
}

export async function moveFolder(
  folderId: string,
  parentId: string | null,
): Promise<Result> {
  await requireSession();
  const t = await getDict();

  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return { error: t.errors.folderNotFound };
  if (folder.kind === "ATTACHMENT") {
    return { error: t.errors.attachedFolderLocked };
  }
  if (parentId === folderId) return { error: t.errors.folderLoop };

  if (parentId) {
    const target = await prisma.folder.findUnique({
      where: { id: parentId },
      select: { id: true, kind: true },
    });
    if (!target) return { error: t.errors.folderNotFound };
    if (target.kind === "ATTACHMENT") {
      return { error: t.errors.attachedFolderLocked };
    }
    // Moving a folder inside its own subtree would detach that subtree from
    // the root entirely, so the destination may not descend from it.
    const chain = await ancestorsOf(parentId);
    if (chain.includes(folderId)) return { error: t.errors.folderLoop };
    if (chain.length >= MAX_DEPTH) {
      return { error: fmt(t.errors.folderTooDeep, { count: MAX_DEPTH }) };
    }
  }

  await prisma.folder.update({ where: { id: folderId }, data: { parentId } });
  revalidateFolder(folder.parentId);
  revalidateFolder(parentId);
  revalidatePath(`/files/${folderId}`);
  return { ok: true };
}

/**
 * Deleting a folder never deletes what is in it: files and child folders are
 * promoted to the deleted folder's own parent. There is no trash to recover
 * from, so the safe reading of "delete this folder" is the non-destructive one.
 */
export async function deleteFolder(folderId: string): Promise<Result> {
  const session = await requireSession();
  const t = await getDict();

  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return { error: t.errors.folderNotFound };
  if (folder.kind === "ATTACHMENT") {
    return { error: t.errors.attachedFolderLocked };
  }
  if (folder.createdById !== session.user.id && session.user.role !== "ADMIN") {
    return { error: t.errors.ownFoldersOnly };
  }

  await prisma.$transaction([
    prisma.fileItem.updateMany({
      where: { folderId },
      data: { folderId: folder.parentId },
    }),
    prisma.folder.updateMany({
      where: { parentId: folderId },
      data: { parentId: folder.parentId },
    }),
    prisma.folder.delete({ where: { id: folderId } }),
  ]);

  await logEvent({
    actorId: session.user.id,
    action: "folder.delete",
    targetType: "folder",
    targetId: folderId,
    meta: { name: folder.name },
  });
  revalidateFolder(folder.parentId);
  return { ok: true };
}
