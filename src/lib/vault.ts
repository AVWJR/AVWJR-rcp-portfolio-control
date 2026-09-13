import { guessVaultKind, isVaultKind, safeVaultFilename, type VaultDocumentMeta, type VaultKind } from "@rcp/documents";
import { INTAKE_MAX_BYTES, INTAKE_MAX_BYTES_LABEL } from "@/lib/deals/types";
import { fileTooLargeMessage } from "@/lib/deals/upload-client";
import { blobStoragePath, deleteStoredFile, getStoredFile, isTrustedBlobUrl, putStoredFile } from "./file-store";
import { prisma } from "./prisma";

export const VAULT_MAX_BYTES = INTAKE_MAX_BYTES;
const MAX_BYTES = VAULT_MAX_BYTES;

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

export function resolveVaultKind(filename: string, selected?: string | null): VaultKind {
  return guessVaultKind(filename, selected && isVaultKind(selected) ? selected : undefined);
}

export async function storeVaultDocument(opts: {
  entityId: string;
  kind: VaultKind;
  title: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  notes?: string;
  existingStoragePath?: string;
}) {
  if (opts.bytes.length > MAX_BYTES) throw new Error(`${fileTooLargeMessage()} vault limit (${INTAKE_MAX_BYTES_LABEL}).`);
  const filename = safeVaultFilename(opts.filename);
  const entity = await prisma.entity.findUnique({ where: { id: opts.entityId } });
  if (!entity) throw new Error("Unknown entity");
  const kind = resolveVaultKind(filename, opts.kind);
  const created = await prisma.vaultDocument.create({
    data: {
      entityId: opts.entityId,
      kind,
      title: opts.title.trim() || filename,
      filename,
      mimeType: opts.mimeType || "application/octet-stream",
      storagePath: "pending",
      byteSize: opts.bytes.length,
      notes: opts.notes?.trim() || null,
    },
  });
  try {
    const storagePath =
      opts.existingStoragePath ??
      (await putStoredFile(`${entity.code}/${created.id}-${filename}`, opts.bytes, opts.mimeType));
    return prisma.vaultDocument.update({
      where: { id: created.id },
      data: { storagePath },
    });
  } catch (error) {
    await prisma.vaultDocument.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }
}

export async function storeVaultDocumentFromBlob(opts: {
  entityId: string;
  kind: VaultKind;
  title: string;
  filename: string;
  mimeType: string;
  blobUrl: string;
  byteSize: number;
  notes?: string;
}) {
  if (!isTrustedBlobUrl(opts.blobUrl)) {
    throw new Error("That Blob URL is not a Vercel Blob object. Re-upload the file from the vault.");
  }
  if (opts.byteSize > MAX_BYTES) {
    throw new Error(`${fileTooLargeMessage()} vault limit (${INTAKE_MAX_BYTES_LABEL}).`);
  }
  const filename = safeVaultFilename(opts.filename);
  const entity = await prisma.entity.findUnique({ where: { id: opts.entityId } });
  if (!entity) throw new Error("Unknown entity");
  return prisma.vaultDocument.create({
    data: {
      entityId: opts.entityId,
      kind: resolveVaultKind(filename, opts.kind),
      title: opts.title.trim() || filename,
      filename,
      mimeType: opts.mimeType || "application/octet-stream",
      storagePath: blobStoragePath(opts.blobUrl),
      byteSize: opts.byteSize > 0 ? opts.byteSize : 0,
      notes: opts.notes?.trim() || null,
    },
  });
}

export async function readVaultDocument(id: string) {
  const doc = await prisma.vaultDocument.findUnique({ where: { id }, include: { entity: true } });
  if (!doc) return null;
  const bytes = await getStoredFile(doc.storagePath);
  return { doc, bytes };
}

export async function deleteVaultDocument(id: string) {
  const doc = await prisma.vaultDocument.findUnique({ where: { id } });
  if (!doc) return;
  await deleteStoredFile(doc.storagePath);
  await prisma.vaultDocument.delete({ where: { id } });
}
