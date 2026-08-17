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
