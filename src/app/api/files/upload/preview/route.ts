import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processImage } from "@/lib/images";
import { deleteObject, saveProcessedUpload } from "@/lib/storage";

// A poster frame is a small canvas JPEG; anything larger is not one.
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

/**
 * Attaches a browser-captured preview to a file that the server could not
 * generate one for: a video's poster frame, or an image in a format sharp
 * cannot decode. The body is the raw JPEG.
 *
 * Only the uploader may set it, and only once — a preview that already exists
 * is never overwritten, so this cannot be used to repaint someone's file.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const file = await prisma.fileItem.findUnique({
    where: { id },
    select: { id: true, uploadedById: true, thumbName: true },
  });
  if (!file || file.uploadedById !== session.user.id) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (file.thumbName) return NextResponse.json({ ok: true });

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PREVIEW_BYTES) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const processed = await processImage(bytes);
  if (!processed) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const thumbName = await saveProcessedUpload(processed.thumb, ".webp");
  // Losing the race against a concurrent preview would orphan the loser's
  // bytes, so only claim the row while it is still empty.
  const claimed = await prisma.fileItem.updateMany({
    where: { id: file.id, thumbName: null },
    data: { thumbName, blurData: processed.blurData },
  });
  if (claimed.count === 0) {
    await deleteObject(thumbName);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}
