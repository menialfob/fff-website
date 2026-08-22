import { randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

/**
 * The app's object store. Everything that reads or writes uploaded bytes goes
 * through this module — it is the only place in the codebase that touches
 * `fs`, so moving to S3 later is a change here and nowhere else.
 *
 * The contract is deliberately S3-shaped:
 *  - a `storedName` is an opaque flat key, never a path (no directories, no
 *    path math at call sites);
 *  - writes take a stream, so a 200 MB upload is never held in memory and the
 *    same call maps onto S3 multipart upload;
 *  - `openObject` takes a byte range, mapping 1:1 onto GetObject + Range.
 *
 * Serving always stays proxied through an authenticated route, so no client
 * ever sees a storage URL. A future S3 driver can answer `openObject` with a
 * presigned redirect without any component changing.
 */

const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

export type StoredObject = {
  /** Bytes for the requested range (or the whole object when unranged). */
  stream: ReadableStream;
  /** Total size of the object, not of the returned range. */
  size: number;
  /** Inclusive byte offsets actually being returned. */
  start: number;
  end: number;
};

/** Extension of a user-supplied filename, safe to append to a generated key. */
function keyExt(filename: string): string {
  return path.extname(filename).slice(0, 16).toLowerCase();
}

function newKey(filename: string): string {
  return `${randomUUID()}${keyExt(filename)}`;
}

/**
 * Streams an upload to storage under a randomized key (never the user-supplied
 * name) and returns the key plus the number of bytes actually written.
 */
export async function saveUploadStream(
  body: ReadableStream<Uint8Array>,
  filename: string,
): Promise<{ storedName: string; size: number }> {
  await mkdir(uploadDir, { recursive: true });
  const storedName = newKey(filename);
  let size = 0;
  const source = Readable.fromWeb(
    body as Parameters<typeof Readable.fromWeb>[0],
  );
  try {
    // Count bytes as they pass through rather than stat()ing afterwards, so
    // the recorded size is always exactly what we stored.
    await pipeline(
      source,
      async function* (chunks) {
        for await (const chunk of chunks) {
          size += (chunk as Buffer).length;
          yield chunk;
        }
      },
      createWriteStream(storedPath(storedName)),
    );
  } catch (err) {
    // A half-written object must never be left behind for the DB to point at.
    await deleteObject(storedName);
    throw err;
  }
  return { storedName, size };
}

/**
 * Saves an uploaded file under a randomized name (never the user-supplied
 * one) and returns the stored name. Buffers the whole file — prefer
 * `saveUploadStream` for anything that can be large.
 */
export async function saveUpload(file: File): Promise<string> {
  const { storedName } = await saveUploadStream(
    file.stream() as ReadableStream<Uint8Array>,
    file.name,
  );
  return storedName;
}

/**
 * Saves server-produced bytes (e.g. a sharp-processed image) under a
 * randomized name with the given extension and returns the stored name.
 */
export async function saveProcessedUpload(
  bytes: Buffer,
  ext: string,
): Promise<string> {
  await mkdir(uploadDir, { recursive: true });
  const storedName = `${randomUUID()}${ext}`;
  await writeFile(storedPath(storedName), bytes);
  return storedName;
}

/** One entry of {@link listObjects} — S3's Key / Size / LastModified. */
export type ObjectSummary = {
  storedName: string;
  size: number;
  modifiedAt: Date;
};

/**
 * Every object in the store. The only way to see what storage holds that the
 * database does not — used by `npm run sweep-orphans` to find bytes left
 * behind by deletions that predate their teardown. Maps onto ListObjectsV2;
 * keys are flat, so anything that is not a plain file at the top level (a
 * stray directory, a symlink) is skipped rather than reported as an object.
 */
export async function listObjects(): Promise<ObjectSummary[]> {
  const entries = await readdir(uploadDir, { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return [];
      throw err;
    },
  );
  const objects: ObjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const info = await stat(storedPath(entry.name));
    objects.push({
      storedName: entry.name,
      size: info.size,
      modifiedAt: info.mtime,
    });
  }
  return objects;
}

/** Removes an object. Missing objects are not an error. */
export async function deleteObject(storedName: string): Promise<void> {
  await unlink(storedPath(storedName)).catch(() => {});
}

/** @deprecated use {@link deleteObject}. */
export const deleteUpload = deleteObject;

export async function readUpload(storedName: string): Promise<Buffer> {
  return readFile(storedPath(storedName));
}

/** Byte length of a stored object. Throws if it is missing. */
export async function objectSize(storedName: string): Promise<number> {
  return (await stat(storedPath(storedName))).size;
}

/**
 * Opens an object for reading, optionally a byte range (inclusive offsets, as
 * in an HTTP `Range` header). The caller is responsible for having clamped the
 * range to the object size — see `objectSize`.
 */
export async function openObject(
  storedName: string,
  range?: { start: number; end: number },
): Promise<StoredObject> {
  const size = await objectSize(storedName);
  const start = range ? range.start : 0;
  const end = range ? range.end : Math.max(0, size - 1);
  const stream = Readable.toWeb(
    createReadStream(storedPath(storedName), { start, end }),
  ) as ReadableStream;
  return { stream, size, start, end };
}

export function uploadStream(storedName: string): ReadableStream {
  return Readable.toWeb(
    createReadStream(storedPath(storedName)),
  ) as ReadableStream;
}

function storedPath(storedName: string): string {
  const resolved = path.resolve(uploadDir, storedName);
  // storedName comes from our own DB, but never allow traversal regardless.
  if (!resolved.startsWith(uploadDir + path.sep)) {
    throw new Error("Invalid file path");
  }
  return resolved;
}
