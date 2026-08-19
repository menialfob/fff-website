import { prisma } from "@/lib/db";
import type { Crumb, FileDTO, FolderDTO } from "./types";

/**
 * Server-side reads for the files section, shared by the root page, the folder
 * pages and the attachment grids embedded in calendar events and forum
 * threads. Everything is mapped to the DTOs in ./types before it crosses into
 * a client component — storage keys never leave the server.
 */

/** Prisma selection producing exactly what toFileDTO needs. */
export const fileSelect = {
  id: true,
  name: true,
  size: true,
  mimeType: true,
  kind: true,
  width: true,
  height: true,
  durationMs: true,
  blurData: true,
  thumbName: true,
  displayName: true,
  createdAt: true,
  uploadedById: true,
  folderId: true,
  uploadedBy: { select: { name: true } },
} as const;

type FileRow = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: FileDTO["kind"];
  width: number | null;
  height: number | null;
  durationMs: number | null;
  blurData: string | null;
  thumbName: string | null;
  displayName: string | null;
  createdAt: Date;
  uploadedById: string;
  folderId: string | null;
  uploadedBy: { name: string } | null;
};

export function toFileDTO(file: FileRow): FileDTO {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    kind: file.kind,
    width: file.width,
    height: file.height,
    durationMs: file.durationMs,
    blurData: file.blurData,
    hasThumb: Boolean(file.thumbName),
    hasDisplay: Boolean(file.displayName),
    createdAt: file.createdAt.toISOString(),
    uploadedById: file.uploadedById,
    uploadedByName: file.uploadedBy?.name ?? "",
    folderId: file.folderId,
  };
}

type FolderRow = {
  id: string;
  name: string;
  kind: FolderDTO["kind"];
  parentId: string | null;
  createdById: string | null;
  _count?: { files: number; children: number };
};

export function toFolderDTO(folder: FolderRow): FolderDTO {
  return {
    id: folder.id,
    name: folder.name,
    kind: folder.kind,
    parentId: folder.parentId,
    fileCount: folder._count?.files ?? 0,
    folderCount: folder._count?.children ?? 0,
    createdById: folder.createdById,
  };
}

const folderSelect = {
  id: true,
  name: true,
  kind: true,
  parentId: true,
  createdById: true,
  _count: { select: { files: true, children: true } },
} as const;

/** Immediate contents of a folder (or of the root when folderId is null). */
export async function listFolder(folderId: string | null) {
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { kind: "USER", parentId: folderId },
      orderBy: { name: "asc" },
      select: folderSelect,
    }),
    prisma.fileItem.findMany({
      where: { folderId },
      orderBy: { createdAt: "desc" },
      select: fileSelect,
    }),
  ]);
  return { folders: folders.map(toFolderDTO), files: files.map(toFileDTO) };
}

/**
 * Root-first trail to a folder. Walks parentId with a hard stop, so a cycle
 * introduced by hand in the database can never hang a page render.
 */
export async function trailTo(folderId: string): Promise<Crumb[]> {
  const crumbs: Crumb[] = [];
  const seen = new Set<string>();
  let current: string | null = folderId;
  while (current && !seen.has(current) && crumbs.length < 20) {
    seen.add(current);
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: current },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    crumbs.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return crumbs;
}

/** Every folder the move picker may offer as a destination. */
export async function listAllUserFolders(): Promise<FolderDTO[]> {
  const folders = await prisma.folder.findMany({
    where: { kind: "USER" },
    orderBy: { name: "asc" },
    select: folderSelect,
  });
  return folders.map(toFolderDTO);
}

/** Folders owned by the calendar or the forum, shown in their own section. */
export async function listAttachedFolders(): Promise<FolderDTO[]> {
  const folders = await prisma.folder.findMany({
    where: { kind: "ATTACHMENT", files: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: folderSelect,
  });
  return folders.map(toFolderDTO);
}

/**
 * What an ATTACHMENT folder belongs to, so its page can link back. Returns
 * null for ordinary folders.
 */
export async function sourceOf(
  folderId: string,
): Promise<{ label: string; href: string } | null> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: {
      event: { select: { id: true, title: true } },
      occurrence: {
        select: { date: true, event: { select: { id: true, title: true } } },
      },
      forumThread: { select: { id: true, title: true } },
    },
  });
  if (!folder) return null;
  if (folder.event) {
    return {
      label: folder.event.title,
      href: `/calendar/${folder.event.id}`,
    };
  }
  if (folder.occurrence) {
    return {
      label: `${folder.occurrence.event.title} · ${folder.occurrence.date}`,
      href: `/calendar/${folder.occurrence.event.id}?d=${folder.occurrence.date}`,
    };
  }
  if (folder.forumThread) {
    return {
      label: folder.forumThread.title,
      href: `/forum/t/${folder.forumThread.id}`,
    };
  }
  return null;
}
