import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processImage } from "@/lib/images";
import {
  objectSize,
  openObject,
  readUpload,
  saveProcessedUpload,
} from "@/lib/storage";

/**
 * Streams a stored file to a signed-in member.
 *
 *   ?v=thumb  the 512px webp preview instead of the original
 *   ?dl=1     force a download instead of rendering in place
 *
 * Byte ranges are honoured, which is not optional: Safari on iOS refuses to
 * play — let alone scrub — media served without `206 Partial Content`.
 */

/**
 * Types we are willing to render inside the app's own origin. Anything else is
 * forced to download as an opaque blob: an uploaded .svg or .html served
 * inline would run as first-party script and could read the member's session.
 */
const INLINE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
  "image/bmp", "image/heic", "image/heif",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
  "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav",
  "audio/webm", "audio/flac", "audio/x-m4a",
  "application/pdf",
  "text/plain",
]);

/** Parses a single-range `Range` header against a known object size. */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // "bytes=-500" — the final 500 bytes.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}

/**
 * Fills in a thumbnail that predates the media columns (or that failed to
 * generate at upload) the first time one is asked for, so the grid heals
 * itself instead of needing a backfill script.
 */
async function backfillThumb(file: {
  id: string;
  storedName: string;
}): Promise<string | null> {
  try {
    const processed = await processImage(await readUpload(file.storedName));
    if (!processed) return null;
    const thumbName = await saveProcessedUpload(processed.thumb, ".webp");
    await prisma.fileItem.update({
      where: { id: file.id },
      data: {
        thumbName,
        blurData: processed.blurData,
        width: processed.width,
        height: processed.height,
      },
    });
    return thumbName;
  } catch {
    // Never fail the request over a missing preview — fall back to the original.
    return null;
  }
}

async function handle(request: Request, id: string, bodyless: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const file = await prisma.fileItem.findUnique({ where: { id } });
  if (!file) return new NextResponse("Not found", { status: 404 });

  const params = new URL(request.url).searchParams;
  const wantsDownload = params.get("dl") === "1";

  let thumbName = file.thumbName;
  if (params.get("v") === "thumb" && !thumbName && file.kind === "IMAGE") {
    thumbName = await backfillThumb(file);
  }
  const serveThumb = params.get("v") === "thumb" && Boolean(thumbName);

  const storedName = serveThumb ? thumbName! : file.storedName;
  // A thumbnail is our own webp; an original keeps its declared type only if
  // we are willing to render that type inline.
  const inlineOk = serveThumb || INLINE_TYPES.has(file.mimeType.toLowerCase());
  const disposition = wantsDownload || !inlineOk ? "attachment" : "inline";
  const contentType = serveThumb
    ? "image/webp"
    : inlineOk
      ? file.mimeType
      : "application/octet-stream";

  let size: number;
  try {
    size = await objectSize(storedName);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(
      serveThumb ? `${file.name}.webp` : file.name,
    )}`,
    // storedName is immutable for a given id, so the bytes never change.
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${size}` },
    });
  }

  if (bodyless) {
    return new NextResponse(null, {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  if (range) {
    const { stream, start, end } = await openObject(storedName, range);
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const { stream } = await openObject(storedName);
  return new NextResponse(stream, {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(request, (await params).id, false);
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(request, (await params).id, true);
}
