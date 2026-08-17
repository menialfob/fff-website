import sharp from "sharp";

/**
 * Server-side image processing for user-supplied pictures (sharp). Everything
 * user-facing is re-encoded to webp so the original bytes (EXIF included) are
 * never served back.
 */

export const AVATAR_SIZE = 512;

/**
 * Process an uploaded profile picture into a square webp: center-crop to
 * AVATAR_SIZE, strip metadata, reasonable quality for a small circle render.
 * Throws if the input is not a decodable image.
 */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "error" })
    .rotate() // apply EXIF orientation before it is stripped
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer();
}

export const ATTACHMENT_THUMB_SIZE = 512;
const BLUR_SIZE = 16;

export type ProcessedImage = {
  width: number;
  height: number;
  thumb: Buffer;
  blurData: string;
};

/**
 * Derived assets for an image/GIF attachment: intrinsic dimensions, a 512px
 * webp thumbnail (first frame for animated GIFs) and a 16px blur placeholder
 * as an inline data URL. Returns null when the input can't be decoded as an
 * image — the caller then treats the upload as a plain file.
 */
export async function processImageAttachment(
  input: Buffer,
): Promise<ProcessedImage | null> {
  try {
    const img = sharp(input, { failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const [thumb, blur] = await Promise.all([
      img
        .clone()
        .resize(ATTACHMENT_THUMB_SIZE, ATTACHMENT_THUMB_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toBuffer(),
      img
        .clone()
        .resize(BLUR_SIZE, BLUR_SIZE, { fit: "inside" })
        .webp({ quality: 40 })
        .toBuffer(),
    ]);
    return {
      width: meta.width,
      height: meta.height,
      thumb,
      blurData: `data:image/webp;base64,${blur.toString("base64")}`,
    };
  } catch {
    return null;
  }
}
