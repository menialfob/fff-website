"use server";

import { logEvent } from "@/lib/audit";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";
import { saveUpload } from "@/lib/storage";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // matches serverActions.bodySizeLimit

/**
 * Upload one image/attachment from a rich-content editor (calendar event or
 * forum post). The file lands unfiled (folderId null) and is claimed into the
 * owning record's folder on save via claimAssets().
 */
export async function uploadContentAsset(formData: FormData) {
  const session = await requireSession();
  const t = await getDict();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t.errors.chooseFile };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: t.errors.fileTooLarge };
  }

  const storedName = await saveUpload(file);
  const item = await prisma.fileItem.create({
    data: {
      name: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById: session.user.id,
    },
  });
  await logEvent({
    actorId: session.user.id,
    action: "file.upload",
    targetType: "file",
    targetId: item.id,
    meta: { name: file.name, size: file.size },
  });
  return {
    ok: true,
    id: item.id,
    url: `/api/files/${item.id}`,
    name: file.name,
    size: file.size,
    isImage: (file.type || "").startsWith("image/"),
  };
}
