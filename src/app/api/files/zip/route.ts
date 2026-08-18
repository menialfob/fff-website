import JSZip from "jszip";
import { NextResponse } from "next/server";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openObject } from "@/lib/storage";

/**
 * Bulk download: zips a selection of files.
 *
 * A POST from a hidden form rather than a GET link, for two reasons — a long
 * selection would blow past URL length limits, and letting the browser follow
 * a form submission means it handles the result as an ordinary download
 * instead of us buffering a whole archive in the page.
 */

/** Total bytes we are willing to zip in one go, to bound server memory. */
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 500;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // The session cookie is SameSite, so a cross-site form post arrives without
  // one and fails above — but this is a POST that reads member data, so check
  // the origin explicitly rather than relying on that alone.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const formData = await request.formData();
  const ids = formData
    .getAll("id")
    .filter((value): value is string => typeof value === "string")
    .slice(0, MAX_FILES);
  if (ids.length === 0) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const files = await prisma.fileItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, storedName: true, size: true },
    orderBy: { name: "asc" },
  });
  if (files.length === 0) return new NextResponse("Not found", { status: 404 });

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  const zip = new JSZip();
  const used = new Map<string, number>();
  for (const file of files) {
    const { stream } = await openObject(file.storedName);
    zip.file(uniqueName(file.name, used), Readable.fromWeb(
      stream as Parameters<typeof Readable.fromWeb>[0],
    ));
  }

  // STORE, not DEFLATE: these are photos, video and PDFs, which are already
  // compressed — deflating them costs CPU on a small box and saves nothing.
  const helper = zip.generateInternalStream({
    type: "uint8array",
    streamFiles: true,
    compression: "STORE",
  });

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      helper
        .on("data", (chunk: Uint8Array) => {
          controller.enqueue(chunk);
          // Respect the consumer's backpressure so a slow phone on mobile
          // data cannot make us buffer the whole archive in memory.
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            helper.pause();
          }
        })
        .on("error", (err: Error) => controller.error(err))
        .on("end", () => controller.close())
        .resume();
    },
    pull() {
      helper.resume();
    },
    cancel() {
      helper.pause();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `fff-filer-${stamp}.zip`,
      )}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Two files really can share a name; a zip entry cannot. */
function uniqueName(name: string, used: Map<string, number>): string {
  const seen = used.get(name) ?? 0;
  used.set(name, seen + 1);
  if (seen === 0) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} (${seen})${name.slice(dot)}`
    : `${name} (${seen})`;
}
