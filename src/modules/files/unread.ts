import { prisma } from "@/lib/db";
import type { FolderDTO } from "./types";

/**
 * The numbers on the folder badges in the files section: how many files
 * somebody else has put in a folder since the member last opened it.
 *
 * The rule mirrors the dashboard's section badges (src/lib/activity.ts) one
 * level down — new to you, never your own upload — with two differences:
 *
 *  - the cursor is per folder (`FolderView`), so opening the files section
 *    clears the home screen badge while each folder keeps its own count until
 *    the member actually goes in and looks;
 *  - a folder's count includes everything below it. A photo dropped three
 *    levels down would otherwise be invisible from the root, which is the one
 *    place people look.
 */
export type FolderUnread = Map<string, number>;

/** How far up the tree a count is carried, matching trailTo's hard stop. */
const MAX_DEPTH = 20;

/**
 * Unread counts for every folder that has any, keyed by folder id. Folders
 * with nothing new are absent rather than zero, because the common case is a
 * quiet archive and the callers only ask about the folders they render.
 */
export async function folderUnreadCounts(
  userId: string,
): Promise<FolderUnread> {
  const [user, views, folders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
    prisma.folderView.findMany({
      where: { userId },
      select: { folderId: true, seenAt: true },
    }),
    prisma.folder.findMany({
      select: { id: true, parentId: true, createdAt: true },
    }),
  ]);
  if (!user || folders.length === 0) return new Map();

  const seenAt = new Map(views.map((v) => [v.folderId, v.seenAt]));

  /**
   * What counts as new in each folder. Never opened means counting from the
   * later of the member's join date and the folder's own creation: the join
   * date so nobody inherits the whole archive as unread on their first day,
   * the folder's creation because nothing in it can predate it anyway — and
   * that keeps the query below bounded by the newest cursor instead of by the
   * oldest account.
   */
  const cutoff = new Map<string, Date>();
  for (const folder of folders) {
    const seen = seenAt.get(folder.id);
    cutoff.set(
      folder.id,
      seen ??
        (folder.createdAt > user.createdAt ? folder.createdAt : user.createdAt),
    );
  }

  const earliest = new Date(
    Math.min(...[...cutoff.values()].map((date) => date.getTime())),
  );
  // One pass over the files that could possibly be new for anywhere, bucketed
  // per folder here rather than as a count query per folder.
  const candidates = await prisma.fileItem.findMany({
    where: {
      folderId: { not: null },
      uploadedById: { not: userId },
      createdAt: { gt: earliest },
    },
    select: { folderId: true, createdAt: true },
  });

  const direct = new Map<string, number>();
  for (const file of candidates) {
    const folderId = file.folderId;
    if (!folderId) continue;
    const since = cutoff.get(folderId);
    if (!since || file.createdAt <= since) continue;
    direct.set(folderId, (direct.get(folderId) ?? 0) + 1);
  }

  // Carry each folder's own count up its ancestors, so a parent stands for
  // everything unread beneath it. Walked per folder with a hard stop and a
  // visited set: a parentId cycle introduced by hand in the database must not
  // hang a page render, the same guarantee trailTo gives.
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  const unread: FolderUnread = new Map();
  for (const [folderId, count] of direct) {
    const walked = new Set<string>([folderId]);
    let current: string | null | undefined = folderId;
    while (current && walked.size <= MAX_DEPTH) {
      unread.set(current, (unread.get(current) ?? 0) + count);
      current = parentOf.get(current);
      if (!current || walked.has(current)) break;
      walked.add(current);
    }
  }
  return unread;
}

/** Hang the counts on folders already mapped for the client. */
export function withUnread(
  folders: FolderDTO[],
  unread: FolderUnread,
): FolderDTO[] {
  return folders.map((folder) => {
    const count = unread.get(folder.id) ?? 0;
    return count > 0 ? { ...folder, unread: count } : folder;
  });
}
