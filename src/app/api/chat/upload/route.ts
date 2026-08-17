import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processImageAttachment } from "@/lib/images";
import { deleteUpload, saveProcessedUpload, saveUpload } from "@/lib/storage";
import type { AttachmentDTO } from "@/lib/realtime";

// Per-file cap before any client-side compression kicks in. Well under the
// server action body limit and the Caddy request cap.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Unclaimed uploads (send never happened) are removed after this long.
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Phase one of sending an attachment: store the file, derive image assets,
 * and create a pending MessageAttachment (messageId null) that sendMessage
 * later claims. Uses a plain route (not a server action) so the client can
 * XHR-upload with real progress events.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Opportunistic GC of abandoned uploads — cheap here, saves a cron.
  void gcOrphans();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "too-large" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const isGif = file.type === "image/gif";
  const looksImage = file.type.startsWith("image/");
  const processed = looksImage ? await processImageAttachment(bytes) : null;

  const storedName = await saveUpload(file);
  const thumbName = processed
    ? await saveProcessedUpload(processed.thumb, ".webp")
    : null;

  const attachment = await prisma.messageAttachment.create({
    data: {
      uploadedById: session.user.id,
      kind: processed ? (isGif ? "GIF" : "IMAGE") : "FILE",
      name: file.name.slice(0, 200) || "file",
      storedName,
      thumbName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      width: processed?.width ?? null,
      height: processed?.height ?? null,
      blurData: processed?.blurData ?? null,
    },
  });

  const dto: AttachmentDTO = {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    width: attachment.width,
    height: attachment.height,
    blurData: attachment.blurData,
    url: `/api/chat/media/${attachment.id}`,
    thumbUrl: attachment.thumbName
      ? `/api/chat/media/${attachment.id}?v=thumb`
      : null,
  };
  return NextResponse.json(dto);
}

async function gcOrphans(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - ORPHAN_TTL_MS);
    const orphans = await prisma.messageAttachment.findMany({
      where: { messageId: null, createdAt: { lt: cutoff } },
      select: { id: true, storedName: true, thumbName: true },
    });
    if (orphans.length === 0) return;
    await prisma.messageAttachment.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
    for (const o of orphans) {
      await deleteUpload(o.storedName);
      if (o.thumbName) await deleteUpload(o.thumbName);
    }
  } catch {
    // GC must never break an upload.
  }
}
