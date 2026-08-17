import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";

const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

/**
 * Saves an uploaded file under a randomized name (never the user-supplied
 * one) and returns the stored name.
 */
export async function saveUpload(file: File): Promise<string> {
  await mkdir(uploadDir, { recursive: true });
  const ext = path.extname(file.name).slice(0, 16);
  const storedName = `${randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, storedName), bytes);
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
  await writeFile(path.join(uploadDir, storedName), bytes);
  return storedName;
}

export async function deleteUpload(storedName: string): Promise<void> {
  await unlink(storedPath(storedName)).catch(() => {});
}

export async function readUpload(storedName: string): Promise<Buffer> {
  return readFile(storedPath(storedName));
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
