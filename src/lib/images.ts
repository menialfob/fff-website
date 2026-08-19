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
/**
 * Longest edge of the copy the full-screen viewer actually shows. A phone at
 * 390pt/3× wants ~1200 device pixels, so 2048 stays sharp there and leaves
 * headroom for a pinch — while weighing a few hundred KB against the 10 MB a
 * camera original costs. The original is fetched only once someone zooms in.
 */
export const DISPLAY_MAX_EDGE = 2048;

export type ProcessedImage = {
  width: number;
  height: number;
  thumb: Buffer;
  blurData: string;
  /** Viewer-sized webp, or null when the source is already no larger. */
  display: Buffer | null;
};

/**
 * Derived assets for an image (chat attachment, uploaded file, or a video's
 * poster frame): intrinsic dimensions, a 512px
 * webp thumbnail (first frame for animated GIFs) and a 16px blur placeholder
 * as an inline data URL. Returns null when the input can't be decoded as an
 * image — the caller then treats the upload as a plain file.
 *
 * Pass `display` to also get the viewer-sized copy; the files section wants
 * one, chat (whose attachments are compressed in the browser first) does not.
 */
export async function processImage(
  input: Buffer,
  options: { display?: boolean } = {},
): Promise<ProcessedImage | null> {
  try {
    const img = sharp(input, { failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    // metadata() reports the stored pixel grid, not the oriented one, so a
    // photo shot in portrait comes back landscape with an EXIF tag saying to
    // turn it. .rotate() applies that tag; the dimensions we hand out have to
    // agree with the result, or every aspect-ratio box is on its side.
    const turned = (meta.orientation ?? 1) >= 5;
    const width = turned ? meta.height : meta.width;
    const height = turned ? meta.width : meta.height;

    const wantsDisplay =
      options.display === true && Math.max(width, height) > DISPLAY_MAX_EDGE;

    const [thumb, blur, display] = await Promise.all([
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
      wantsDisplay
        ? img
            .clone()
            .resize(DISPLAY_MAX_EDGE, DISPLAY_MAX_EDGE, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 82 })
            .toBuffer()
        : Promise.resolve(null),
    ]);
    return {
      width,
      height,
      thumb,
      blurData: `data:image/webp;base64,${blur.toString("base64")}`,
      display,
    };
  } catch {
    return null;
  }
}

/** @deprecated name kept for the chat module; use {@link processImage}. */
export const processImageAttachment = processImage;
