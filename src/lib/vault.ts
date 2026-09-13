import { isVaultKind, safeVaultFilename, type VaultDocumentMeta, type VaultKind } from "@rcp/documents";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { prisma } from "./prisma";

export const VAULT_ROOT = resolve(process.cwd(), "data", "vault");
const MAX_BYTES = 10 * 1024 * 1024;

function absPath(storagePath: string) {
  const abs = resolve(VAULT_ROOT, storagePath);
  if (!abs.startsWith(VAULT_ROOT)) throw new Error("Invalid vault path");
  return abs;
}

export async function listVaultDocuments(entityId?: string): Promise<VaultDocumentMeta[]> {
  const rows = await prisma.vaultDocument.findMany({
    where: entityId ? { entityId } : undefined,
    include: { entity: true },
    orderBy: [{ uploadedAt: "desc" }],
  });
  return rows.map((d) => ({
    id: d.id,
    entityCode: d.entity.code,
    entityName: d.entity.name,
    kind: isVaultKind(d.kind) ? d.kind : "other",
    title: d.title,
    filename: d.filename,
    mimeType: d.mimeType,
    byteSize: d.byteSize,
    notes: d.notes,
    uploadedAt: d.uploadedAt.toISOString(),
  }));
}

export async function storeVaultDocument(opts: {
  entityId: string;
  kind: VaultKind;
  title: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  notes?: string;
}) {
  if (opts.bytes.length > MAX_BYTES) throw new Error("File exceeds 10 MB vault limit");
  const filename = safeVaultFilename(opts.filename);
  const entity = await prisma.entity.findUnique({ where: { id: opts.entityId } });
  if (!entity) throw new Error("Unknown entity");
  const created = await prisma.vaultDocument.create({
    data: {
      entityId: opts.entityId,
      kind: opts.kind,
      title: opts.title.trim() || filename,
      filename,
      mimeType: opts.mimeType || "application/octet-stream",
      storagePath: "pending",
      byteSize: opts.bytes.length,
      notes: opts.notes?.trim() || null,
    },
  });
  const storagePath = `${entity.code}/${created.id}-${filename}`;
  const dest = absPath(storagePath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, opts.bytes);
  return prisma.vaultDocument.update({
    where: { id: created.id },
    data: { storagePath },
  });
}

export async function readVaultDocument(id: string) {
  const doc = await prisma.vaultDocument.findUnique({ where: { id }, include: { entity: true } });
  if (!doc) return null;
  const bytes = await readFile(absPath(doc.storagePath));
  return { doc, bytes };
}

export async function deleteVaultDocument(id: string) {
  const doc = await prisma.vaultDocument.findUnique({ where: { id } });
  if (!doc) return;
  try {
    await unlink(absPath(doc.storagePath));
  } catch {
    // metadata delete still proceeds if the blob is already gone
  }
  await prisma.vaultDocument.delete({ where: { id } });
}

export { join };
