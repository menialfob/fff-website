import type { FileKind, FolderKind } from "@prisma/client";

/**
 * Serialisable shapes handed from the server pages and the upload route to the
 * client components. Dates are ISO strings and storage keys never cross the
 * boundary — the client addresses bytes only through the routes below, so the
 * move to S3 changes nothing here.
 */

export type FileDTO = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: FileKind;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  blurData: string | null;
  /** Whether ?v=thumb will return a preview rather than the original. */
  hasThumb: boolean;
  /** Whether ?v=display will return a viewer-sized copy of a large image. */
  hasDisplay: boolean;
  createdAt: string;
  uploadedById: string;
  uploadedByName: string;
  folderId: string | null;
};

export type FolderDTO = {
  id: string;
  name: string;
  kind: FolderKind;
  parentId: string | null;
  fileCount: number;
  folderCount: number;
  createdById: string | null;
};

/** One hop of the breadcrumb trail, root-first. */
export type Crumb = { id: string; name: string };

export type Viewer = { id: string; role: string };

/** The bytes themselves, rendered in place where the type allows. */
export function fileUrl(id: string): string {
  return `/api/files/${id}`;
}

/** The 512px preview, falling back to the original when none exists. */
export function thumbUrl(file: Pick<FileDTO, "id" | "hasThumb">): string {
  return file.hasThumb ? `/api/files/${file.id}?v=thumb` : `/api/files/${file.id}`;
}

/**
 * The viewer-sized copy (2048px webp), falling back to the original when the
 * image was never big enough to be worth one. This is what the full-screen
 * viewer shows: a camera original is tens of megabytes and arrives visibly
 * band by band on a phone.
 */
export function displayUrl(file: Pick<FileDTO, "id" | "hasDisplay">): string {
  return file.hasDisplay
    ? `/api/files/${file.id}?v=display`
    : `/api/files/${file.id}`;
}

/** Always an attachment, whatever the type. */
export function downloadUrl(id: string): string {
  return `/api/files/${id}?dl=1`;
}

export const MAX_FILE_SIZE = 200 * 1024 * 1024;
