import { prisma } from "@/lib/db";

// Generous cap for a TipTap document — images live in files, not inline.
export const MAX_CONTENT_BYTES = 512 * 1024;

export type ParsedContent = {
  contentJson: string | null;
  attachmentIds: string[];
};

/**
 * Rich content + attachment ids from a form. Returns null on invalid content;
 * an empty document is normalized to null. Shared by calendar events, calendar
 * occurrences and forum posts.
 */
export function parseContentFields(formData: FormData): ParsedContent | null {
  const raw = formData.get("contentJson");
  let contentJson: string | null =
    typeof raw === "string" && raw.trim() ? raw.trim() : null;
  if (contentJson) {
    if (Buffer.byteLength(contentJson, "utf8") > MAX_CONTENT_BYTES) return null;
    try {
      const doc = JSON.parse(contentJson);
      if (!doc || typeof doc !== "object" || doc.type !== "doc") return null;
      // An empty document is stored as null.
      if (doc.content?.length === 0) contentJson = null;
    } catch {
      return null;
    }
  }

  const attachmentIds = formData
    .getAll("attachmentIds")
    .filter(
      (v): v is string => typeof v === "string" && /^[A-Za-z0-9]+$/.test(v),
    );
  return { contentJson, attachmentIds };
}

/** File ids of inline images (`/api/files/<id>` sources) in a TipTap doc. */
export function extractImageFileIds(contentJson: string | null): string[] {
  if (!contentJson) return [];
  const ids: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      attrs?: { src?: unknown };
      content?: unknown[];
    };
    if (n.type === "image" && typeof n.attrs?.src === "string") {
      const m = /^\/api\/files\/([A-Za-z0-9]+)$/.exec(n.attrs.src);
      if (m) ids.push(m[1]);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  try {
    walk(JSON.parse(contentJson));
  } catch {
    // Validated earlier; ignore.
  }
  return ids;
}

/** The unique set of asset ids (inline images + attachments) referenced. */
export function collectAssetIds(parsed: ParsedContent): string[] {
  return [
    ...new Set([
      ...extractImageFileIds(parsed.contentJson),
      ...parsed.attachmentIds,
    ]),
  ];
}

/**
 * Move a document's assets (inline images + attachments) into a folder so they
 * are discoverable in the files section. Only unfiled uploads owned by the
 * acting user are claimed — a foreign id can't steal files from other folders
 * or users.
 */
export async function claimAssets(
  parsed: ParsedContent,
  folderId: string,
  userId: string,
) {
  const ids = collectAssetIds(parsed);
  if (ids.length === 0) return;
  await prisma.fileItem.updateMany({
    where: { id: { in: ids }, folderId: null, uploadedById: userId },
    data: { folderId },
  });
}
