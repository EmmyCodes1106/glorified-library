import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const COVER_DIR = path.join(process.cwd(), "public", "uploads", "covers");
export const COVER_URL_PREFIX = "/uploads/covers/";
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const COVER_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export type CoverError = { error: string };

export async function saveCoverFile(
  bytes: Buffer,
  contentType: string
): Promise<{ path: string } | CoverError> {
  if (bytes.byteLength > MAX_COVER_BYTES) {
    return { error: "Cover images must be 5 MB or smaller." };
  }
  const extension = COVER_TYPES.get(contentType);
  if (!extension) {
    return { error: "Cover images must be JPG, PNG, WebP or GIF." };
  }

  await mkdir(COVER_DIR, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  await writeFile(path.join(COVER_DIR, fileName), bytes);
  return { path: `${COVER_URL_PREFIX}${fileName}` };
}

export async function deleteCover(coverPath: string | null | undefined) {
  if (!coverPath?.startsWith(COVER_URL_PREFIX)) return;

  const fileName = path.basename(coverPath);
  try {
    await unlink(path.join(COVER_DIR, fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
