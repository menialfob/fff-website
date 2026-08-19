import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DISPLAY_MAX_EDGE, processImage } from "@/lib/images";
import {
  objectSize,
  openObject,
  readUpload,
  saveProcessedUpload,
} from "@/lib/storage";

/**
 * Streams a stored file to a signed-in member.
 *
 *   ?v=thumb    the 512px webp preview instead of the original
 *   ?v=display  the 2048px webp the full-screen viewer shows
 *   ?dl=1       force a download instead of rendering in place
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
  "text/plain", "text/markdown",
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
 * Fills in the renditions of an image that predates the media columns (or that
 * failed to generate at upload) the first time one is asked for, so the
 * section heals itself instead of needing a backfill script. Decoding the
 * original is the expensive part, so both sizes are derived from the one pass.
 *
 * Only the columns that are still empty are claimed: overwriting a rendition
 * that already exists would orphan its bytes. The intrinsics are refreshed
 * either way — rows written before orientation was taken into account hold a
 * portrait photo's size the wrong way round.
 */
async function backfillRenditions(file: {
  id: string;
  storedName: string;
  thumbName: string | null;
  displayName: string | null;
}): Promise<{ thumbName: string | null; displayName: string | null }> {
  const current = { thumbName: file.thumbName, displayName: file.displayName };
  try {
    const processed = await processImage(await readUpload(file.storedName), {
      display: true,
    });
    if (!processed) return current;

    const data: {
      thumbName?: string;
      displayName?: string;
      blurData: string;
      width: number;
      height: number;
    } = {
      blurData: processed.blurData,
      width: processed.width,
      height: processed.height,
    };
    if (!current.thumbName) {
      current.thumbName = await saveProcessedUpload(processed.thumb, ".webp");
      data.thumbName = current.thumbName;
    }
    if (!current.displayName && processed.display) {
      current.displayName = await saveProcessedUpload(processed.display, ".webp");
      data.displayName = current.displayName;
    }
    await prisma.fileItem.update({ where: { id: file.id }, data });
    return current;
  } catch {
    // Never fail the request over a missing preview — fall back to the original.
    return current;
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

  const variant = params.get("v");
  let { thumbName, displayName } = file;
  // A rendition that was never generated is derived now, once, and kept, so
  // files predating a column heal on first view rather than needing a script.
  //
  // For the display copy an empty column is not enough to go on: an image that
  // was never bigger than one has none by design. The recorded intrinsics
  // settle it — and a row too old to have those gets one pass to fill them in,
  // after which this asks the right question.
  const oversized =
    file.width == null || Math.max(file.width, file.height ?? 0) > DISPLAY_MAX_EDGE;
  if (
    file.kind === "IMAGE" &&
    ((variant === "thumb" && !thumbName) ||
      (variant === "display" && !displayName && oversized))
  ) {
    ({ thumbName, displayName } = await backfillRenditions(file));
  }

  // Either rendition falls back to the original when we have not got one —
  // a small image never gets a display copy, and that is the point.
  const rendition =
    variant === "thumb" ? thumbName : variant === "display" ? displayName : null;
  const storedName = rendition ?? file.storedName;
  // A rendition is our own webp; an original keeps its declared type only if
  // we are willing to render that type inline.
  const inlineOk = rendition !== null || INLINE_TYPES.has(file.mimeType.toLowerCase());
  const disposition = wantsDownload || !inlineOk ? "attachment" : "inline";
  const contentType = rendition
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
      rendition ? `${file.name}.webp` : file.name,
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
