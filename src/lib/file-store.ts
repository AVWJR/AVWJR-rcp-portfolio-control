import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "./prisma";

export const FILE_STORE_ROOT = resolve(process.cwd(), "data", "vault");

export type FileStoreBackend = "blob" | "db" | "fs";

export class FileStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FileStoreError";
  }
}

const FS_PREFIX = "fs:";
const DB_PREFIX = "db:";
export const BLOB_PREFIX = "blob:";

export function isOnVercel(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL === "1" || env.VERCEL === "true";
}

export function isBlobTokenConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function blobStoragePath(url: string): string {
  return url.startsWith(BLOB_PREFIX) ? url : `${BLOB_PREFIX}${url}`;
}

export function isTrustedBlobUrl(url: string): boolean {
  try {
    const raw = url.startsWith(BLOB_PREFIX) ? url.slice(BLOB_PREFIX.length) : url;
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "blob.vercel-storage.com" || host.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function resolveFileStoreBackend(env: NodeJS.ProcessEnv = process.env): FileStoreBackend {
  const forced = env.RCP_FILE_STORE?.trim().toLowerCase();
  if (forced === "blob" || forced === "db" || forced === "fs") return forced;
  if (isBlobTokenConfigured(env)) return "blob";
  if (isOnVercel(env)) return "db";
  return "fs";
}

export function describeFileStore(env: NodeJS.ProcessEnv = process.env): string {
  const backend = resolveFileStoreBackend(env);
  if (backend === "blob") {
    return "Vercel Blob (private objects; BLOB_READ_WRITE_TOKEN)";
  }
  if (backend === "db") {
    return "Neon/SQLite StoredBlob rows (durable on Vercel; used when local FS is ephemeral)";
  }
  return "Local filesystem under data/vault/ (laptop demo)";
}

function absFsPath(relative: string) {
  const abs = resolve(FILE_STORE_ROOT, relative);
  if (!abs.startsWith(FILE_STORE_ROOT)) {
    throw new FileStoreError("Invalid vault path.");
  }
  return abs;
}

function storageKind(storagePath: string): FileStoreBackend | "legacy-fs" {
  if (storagePath.startsWith(BLOB_PREFIX)) return "blob";
  if (storagePath.startsWith(DB_PREFIX)) return "db";
  if (storagePath.startsWith(FS_PREFIX)) return "fs";
  return "legacy-fs";
}

function stripPrefix(storagePath: string, prefix: string) {
  return storagePath.slice(prefix.length);
}

async function putOnFs(key: string, bytes: Buffer): Promise<string> {
  const dest = absFsPath(key);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
  return `${FS_PREFIX}${key}`;
}

async function getFromFs(key: string): Promise<Buffer> {
  return readFile(absFsPath(key));
}

async function deleteFromFs(key: string) {
  try {
    await unlink(absFsPath(key));
  } catch {
    // already gone
  }
}

async function putOnDb(key: string, bytes: Buffer, mimeType: string): Promise<string> {
  const row = await prisma.storedBlob.create({
    data: {
      key,
      mimeType: mimeType || "application/octet-stream",
      byteSize: bytes.length,
      bytes: new Uint8Array(bytes),
    },
  });
  return `${DB_PREFIX}${row.id}`;
}

async function getFromDb(id: string): Promise<Buffer> {
  const row = await prisma.storedBlob.findUnique({ where: { id } });
  if (!row) throw new FileStoreError("Stored file is missing from the database.");
  return Buffer.from(row.bytes);
}

async function deleteFromDb(id: string) {
  try {
    await prisma.storedBlob.delete({ where: { id } });
  } catch {
    // already gone
  }
}

async function putOnBlob(key: string, bytes: Buffer, mimeType: string): Promise<string> {
  const { put } = await import("@vercel/blob");
  const blob = await put(`rcp-vault/${key}`, bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: mimeType || "application/octet-stream",
  });
  return `${BLOB_PREFIX}${blob.url}`;
}

async function getFromBlob(url: string): Promise<Buffer> {
  const { get } = await import("@vercel/blob");
  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new FileStoreError("Stored file is missing from Vercel Blob.");
  }
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function deleteFromBlob(url: string) {
  try {
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch {
    // metadata delete still proceeds
  }
}

function friendlyWriteError(backend: FileStoreBackend, error: unknown): FileStoreError {
  const raw = error instanceof Error ? error.message : "Unknown storage error";
  if (backend === "fs") {
    return new FileStoreError(
      `Could not write the file to local disk (${raw}). On Vercel the filesystem is ephemeral — set BLOB_READ_WRITE_TOKEN or rely on the Neon StoredBlob fallback.`,
      { cause: error },
    );
  }
  if (backend === "blob") {
    return new FileStoreError(
      `Vercel Blob upload failed (${raw}). Check BLOB_READ_WRITE_TOKEN, or unset it to store files in Neon.`,
      { cause: error },
    );
  }
  return new FileStoreError(
    `Could not store the file in the database (${raw}). Confirm Prisma tables are pushed (including StoredBlob) and DIRECT_URL is set for Neon.`,
    { cause: error },
  );
}

export async function putStoredFile(key: string, bytes: Buffer, mimeType: string): Promise<string> {
  const backend = resolveFileStoreBackend();
  try {
    if (backend === "blob") return await putOnBlob(key, bytes, mimeType);
    if (backend === "db") return await putOnDb(key, bytes, mimeType);
    return await putOnFs(key, bytes);
  } catch (error) {
    if (error instanceof FileStoreError) throw error;
    if (backend === "blob") {
      try {
        return await putOnDb(key, bytes, mimeType);
      } catch (fallbackError) {
        throw friendlyWriteError("db", fallbackError);
      }
    }
    throw friendlyWriteError(backend, error);
  }
}

export async function getStoredFile(storagePath: string): Promise<Buffer> {
  const kind = storageKind(storagePath);
  try {
    if (kind === "blob") return await getFromBlob(stripPrefix(storagePath, BLOB_PREFIX));
    if (kind === "db") return await getFromDb(stripPrefix(storagePath, DB_PREFIX));
    const key = kind === "fs" ? stripPrefix(storagePath, FS_PREFIX) : storagePath;
    return await getFromFs(key);
  } catch (error) {
    if (error instanceof FileStoreError) throw error;
    throw new FileStoreError(
      `Could not read the stored file (${error instanceof Error ? error.message : "unknown error"}). The upload metadata exists, but the blob is missing from ${kind}.`,
      { cause: error },
    );
  }
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  if (!storagePath || storagePath === "pending") return;
  const kind = storageKind(storagePath);
  if (kind === "blob") {
    await deleteFromBlob(stripPrefix(storagePath, BLOB_PREFIX));
    return;
  }
  if (kind === "db") {
    await deleteFromDb(stripPrefix(storagePath, DB_PREFIX));
    return;
  }
  const key = kind === "fs" ? stripPrefix(storagePath, FS_PREFIX) : storagePath;
  await deleteFromFs(key);
}
