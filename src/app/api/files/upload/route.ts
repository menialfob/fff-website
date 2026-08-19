import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { processImage } from "@/lib/images";
import {
  deleteObject,
  readUpload,
  saveProcessedUpload,
  saveUploadStream,
} from "@/lib/storage";
import { kindFor } from "@/modules/files/kind";
import { MAX_FILE_SIZE, type FileDTO } from "@/modules/files/types";

/**
 * Uploads one file. A plain route rather than a server action for two reasons:
 * the browser can report real progress over XHR, and each file of a batch
 * succeeds, fails or retries on its own.
 *
 * The body is the raw bytes, not multipart, so it streams straight to storage
 * and a 200 MB video is never held in memory. Metadata rides in headers.
 * The push notification is deliberately not sent here — the client calls
 * notifyUploads() once when the whole batch settles.
 */

function header(request: Request, name: string): string {
  return request.headers.get(name) ?? "";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const name =
    decodeURIComponent(header(request, "x-file-name")).slice(0, 200) || "file";
  const mimeType = header(request, "x-file-type") || "application/octet-stream";
  const declaredSize = Number(header(request, "x-file-size")) || 0;
  if (declaredSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "too-large" }, { status: 413 });
  }

  const rawFolderId = header(request, "x-folder-id");
  let folderId: string | null = null;
  if (rawFolderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: rawFolderId },
      select: { id: true },
    });
    if (!folder) {
      return NextResponse.json({ error: "folder-not-found" }, { status: 404 });
    }
    folderId = folder.id;
  }

  const { storedName, size } = await saveUploadStream(
    request.body as ReadableStream<Uint8Array>,
    name,
  );
  // The declared size is a hint; the stream is the truth, so re-check it here.
  if (size === 0 || size > MAX_FILE_SIZE) {
    await deleteObject(storedName);
    return NextResponse.json(
      { error: size === 0 ? "invalid" : "too-large" },
      { status: size === 0 ? 400 : 413 },
    );
  }
  // Fewer bytes arrived than the browser said it was sending, so something
  // between the two ended the stream early. A short read is not a smaller
  // file: a JPEG cut off two thirds of the way down still decodes, still
  // thumbnails, and still looks like a photo — with a grey band where the
  // rows that never arrived should be. Refusing it is the only way the member
  // finds out, so the upload fails and retries instead of silently storing a
  // corrupt file forever.
  if (declaredSize > 0 && size !== declaredSize) {
    await deleteObject(storedName);
    return NextResponse.json({ error: "truncated" }, { status: 400 });
  }

  const kind = kindFor(mimeType, name);

  // Images get their preview here. Videos cannot — there is no ffmpeg on the
  // server — so the browser captures a poster frame and posts it to
  // ./preview, which is also the fallback for images sharp cannot decode
  // (HEIC, most notably, is absent from the stock libvips build).
  let thumbName: string | null = null;
  let displayName: string | null = null;
  let blurData: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (kind === "IMAGE") {
    // The display copy is what the viewer shows; the original is only fetched
    // when someone zooms past what it can resolve.
    const processed = await processImage(await readUpload(storedName), {
      display: true,
    });
    if (processed) {
      thumbName = await saveProcessedUpload(processed.thumb, ".webp");
      displayName = processed.display
        ? await saveProcessedUpload(processed.display, ".webp")
        : null;
      blurData = processed.blurData;
      width = processed.width;
      height = processed.height;
    }
  }

  const durationMs = Number(header(request, "x-duration-ms")) || null;
  // Browser-measured intrinsics, used wherever sharp did not supply them:
  // video, and images libvips could not decode.
  width ??= Number(header(request, "x-width")) || null;
  height ??= Number(header(request, "x-height")) || null;

  const item = await prisma.fileItem.create({
    data: {
      name,
      storedName,
      mimeType,
      size,
      kind,
      thumbName,
      displayName,
      blurData,
      width,
      height,
      durationMs,
      uploadedById: session.user.id,
      folderId,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  await logEvent({
    actorId: session.user.id,
    action: "file.upload",
    targetType: "file",
    targetId: item.id,
    meta: { name: item.name, size: item.size },
  });

  const dto: FileDTO = {
    id: item.id,
    name: item.name,
    size: item.size,
    mimeType: item.mimeType,
    kind: item.kind,
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    blurData: item.blurData,
    hasThumb: Boolean(item.thumbName),
    hasDisplay: Boolean(item.displayName),
    createdAt: item.createdAt.toISOString(),
    uploadedById: item.uploadedById,
    uploadedByName: item.uploadedBy.name,
    folderId: item.folderId,
  };
  return NextResponse.json(dto);
}
