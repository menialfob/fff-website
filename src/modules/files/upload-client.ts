"use client";

import { kindFor } from "./kind";
import type { FileDTO } from "./types";

/**
 * Browser half of the upload pipeline: XHR (fetch still cannot report upload
 * progress) plus the preview capture the server cannot do for itself.
 */

/** Longest we wait for a video to yield a frame before giving up on a poster. */
const POSTER_TIMEOUT_MS = 5000;
const POSTER_MAX_EDGE = 1024;
const POSTER_QUALITY = 0.82;

export type Measured = {
  width?: number;
  height?: number;
  durationMs?: number;
  /** Poster/preview JPEG, when the browser managed to produce one. */
  preview?: Blob;
};

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", POSTER_QUALITY),
  );
}

function drawScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Grabs a poster frame and the intrinsic size/duration of a video by seeking a
 * detached <video> and painting it to a canvas. iOS Safari is unreliable here
 * (it will not decode without `playsinline` + `muted`, and sometimes not at
 * all), so every failure path resolves to "no poster" rather than throwing —
 * a missing thumbnail must never block an upload.
 */
function measureVideo(file: File): Promise<Measured> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const finish = (result: Measured) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish({}), POSTER_TIMEOUT_MS);

    const intrinsics = (): Measured => ({
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      durationMs: Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : undefined,
    });

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";

    video.onerror = () => finish({});
    video.onloadedmetadata = () => {
      // A frame at t=0 is often black; a second in is usually representative.
      const target = Math.min(1, (video.duration || 0) / 2);
      const seek = () => {
        try {
          video.currentTime = target;
        } catch {
          finish(intrinsics());
        }
      };
      if (video.readyState >= 1) seek();
      else video.oncanplay = seek;
    };
    video.onseeked = async () => {
      const measured = intrinsics();
      try {
        const canvas = drawScaled(video, video.videoWidth, video.videoHeight);
        const blob = canvas ? await blobFromCanvas(canvas) : null;
        finish({ ...measured, preview: blob ?? undefined });
      } catch {
        finish(measured);
      }
    };

    video.src = url;
  });
}

/**
 * Intrinsic size of an image, plus a JPEG preview used only when the server
 * could not decode the format itself (HEIC from an iPhone, mainly).
 */
async function measureImage(file: File): Promise<Measured> {
  try {
    const bitmap = await createImageBitmap(file);
    const measured = { width: bitmap.width, height: bitmap.height };
    const canvas = drawScaled(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    const blob = canvas ? await blobFromCanvas(canvas) : null;
    return { ...measured, preview: blob ?? undefined };
  } catch {
    return {};
  }
}

/** Whatever the browser can tell us about a file before it is uploaded. */
export async function measure(file: File): Promise<Measured> {
  const kind = kindFor(file.type, file.name);
  if (kind === "VIDEO") return measureVideo(file);
  if (kind === "IMAGE") return measureImage(file);
  return {};
}

function send(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.response)
        : reject(new Error(xhr.response?.error ?? String(xhr.status)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    if (signal?.aborted) {
      xhr.abort();
      return;
    }
    xhr.send(body);
  });
}

/**
 * Uploads one file and returns the stored item. The preview, when the browser
 * produced one and the server did not, is attached afterwards: it is a nicety,
 * so a failure there is swallowed rather than failing the upload.
 */
export async function uploadFile(
  file: File,
  options: {
    folderId?: string | null;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<FileDTO> {
  const measured = await measure(file);

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "x-file-name": encodeURIComponent(file.name),
    "x-file-type": file.type || "application/octet-stream",
    "x-file-size": String(file.size),
  };
  if (options.folderId) headers["x-folder-id"] = options.folderId;
  if (measured.width) headers["x-width"] = String(measured.width);
  if (measured.height) headers["x-height"] = String(measured.height);
  if (measured.durationMs) headers["x-duration-ms"] = String(measured.durationMs);

  const item = (await send(
    "/api/files/upload",
    file,
    headers,
    options.onProgress,
    options.signal,
  )) as FileDTO;

  if (!item.hasThumb && measured.preview) {
    try {
      await send(
        `/api/files/upload/preview?id=${encodeURIComponent(item.id)}`,
        measured.preview,
        { "Content-Type": "image/jpeg" },
        undefined,
        options.signal,
      );
      return { ...item, hasThumb: true };
    } catch {
      // No preview is a cosmetic loss, never an upload failure.
    }
  }
  return item;
}
