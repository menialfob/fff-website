import type { FileKind } from "@prisma/client";

/**
 * One classifier for uploaded files, shared by the upload route, the browser
 * grid and the viewer, so all three always agree on how a file is presented.
 * Imports nothing server-only — it runs on both sides.
 */

export type { FileKind };

// Extensions worth trusting over the browser-supplied MIME type, which is
// empty or "application/octet-stream" surprisingly often (AirDrop, some
// Android file pickers, anything arriving from a share sheet).
const EXT_KINDS: Record<string, FileKind> = {
  // images
  jpg: "IMAGE", jpeg: "IMAGE", png: "IMAGE", gif: "IMAGE", webp: "IMAGE",
  avif: "IMAGE", bmp: "IMAGE", heic: "IMAGE", heif: "IMAGE", tif: "IMAGE",
  tiff: "IMAGE",
  // video
  mp4: "VIDEO", m4v: "VIDEO", mov: "VIDEO", webm: "VIDEO", mkv: "VIDEO",
  avi: "VIDEO", "3gp": "VIDEO",
  // audio
  mp3: "AUDIO", m4a: "AUDIO", aac: "AUDIO", wav: "AUDIO", ogg: "AUDIO",
  oga: "AUDIO", flac: "AUDIO", opus: "AUDIO",
  // documents
  pdf: "PDF",
  doc: "DOC", docx: "DOC", odt: "DOC", rtf: "DOC",
  xls: "DOC", xlsx: "DOC", ods: "DOC", csv: "DOC",
  ppt: "DOC", pptx: "DOC", odp: "DOC",
  txt: "DOC", md: "DOC",
};

const MIME_KINDS: Record<string, FileKind> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.ms-excel": "DOC",
  "application/vnd.ms-powerpoint": "DOC",
  "application/rtf": "DOC",
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** How to present a file, from its MIME type with the extension as backup. */
export function kindFor(mimeType: string, filename: string): FileKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return mime === "image/svg+xml" ? "OTHER" : "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (MIME_KINDS[mime]) return MIME_KINDS[mime];
  if (mime.startsWith("text/")) return "DOC";
  if (
    mime.startsWith("application/vnd.openxmlformats-officedocument.") ||
    mime.startsWith("application/vnd.oasis.opendocument.")
  ) {
    return "DOC";
  }
  return EXT_KINDS[extensionOf(filename)] ?? "OTHER";
}

/** Kinds the viewer can render in place rather than offering as a download. */
export function isViewable(kind: FileKind): boolean {
  return kind !== "OTHER";
}

/** Kinds that get a real picture in the grid rather than an icon tile. */
export function hasThumbnail(kind: FileKind): boolean {
  return kind === "IMAGE" || kind === "VIDEO";
}

/**
 * Office family of a DOC file, used only to pick its tile icon and colour —
 * Word blue, Excel green, PowerPoint orange, everything else neutral.
 */
export type DocFamily = "word" | "excel" | "powerpoint" | "text" | "other";

export function docFamily(mimeType: string, filename: string): DocFamily {
  const ext = extensionOf(filename);
  const mime = mimeType.toLowerCase();
  if (["doc", "docx", "odt", "rtf"].includes(ext) || mime.includes("word")) {
    return "word";
  }
  if (
    ["xls", "xlsx", "ods", "csv"].includes(ext) ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "excel";
  }
  if (
    ["ppt", "pptx", "odp"].includes(ext) ||
    mime.includes("presentation") ||
    mime.includes("powerpoint")
  ) {
    return "powerpoint";
  }
  if (["txt", "md"].includes(ext) || mime.startsWith("text/")) return "text";
  return "other";
}
