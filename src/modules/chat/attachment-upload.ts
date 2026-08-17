"use client";

import type { AttachmentDTO } from "@/lib/realtime";

// Photos above this long edge are downscaled client-side before upload —
// phone camera images shrink from ~10MB to well under 1MB.
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;

/**
 * Downscale/compress an image on-device via canvas. GIFs (animation would be
 * lost) and non-images pass through untouched; any decode failure falls back
 * to the original file so uploads never break on odd formats.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Upload one file to /api/chat/upload via XHR (fetch has no upload progress)
 * and resolve with the pending attachment DTO.
 */
export function uploadAttachment(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<AttachmentDTO> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/chat/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.id) {
        resolve(xhr.response as AttachmentDTO);
      } else {
        reject(new Error(String(xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error("network"));
    const formData = new FormData();
    formData.set("file", file);
    xhr.send(formData);
  });
}
