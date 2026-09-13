import { prisma } from "@/lib/prisma";
import {
  blobStoragePath,
  deleteStoredFile,
  getStoredFile,
  isTrustedBlobUrl,
  putStoredFile,
} from "@/lib/file-store";
import { storeVaultDocument } from "@/lib/vault";
import { safeVaultFilename, type VaultKind } from "@rcp/documents";
import { inferFileRole } from "./infer";
import { getIntake } from "./intake";
import { INTAKE_MAX_BYTES, INTAKE_MAX_BYTES_LABEL, isDealFileClass, type DealFileClass, type DealFileSource } from "./types";
import { fileTooLargeMessage } from "./upload-client";
import { assertReadableWorkbook, isAllowedIntakeFilename, isSpreadsheetFilename, SPREADSHEET_MIME_TYPES } from "./workbook";

export function classificationToVaultKind(classification: string): VaultKind {
  switch (classification) {
    case "rent_roll_csv":
      return "rent_roll";
    case "budget_csv":
      return "budget";
    case "loan_doc":
      return "loan";
    case "lease":
      return "lease";
    case "om_cim":
      return "om_cim";
    case "insurance":
      return "insurance";
    case "t12_pl":
      return "other";
    default:
      return "other";
  }
}

export function guessClassification(filename: string, bytes?: Buffer): DealFileClass {
  return inferFileRole(filename, bytes);
}

export async function storeIntakeFile(opts: {
  intakeId: string;
  source: DealFileSource;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  classification?: string;
  remoteId?: string;
  existingStoragePath?: string;
}) {
  if (opts.bytes.length === 0) {
    throw new Error("The file is empty. Choose a rent-roll CSV, XLSX, or PDF that has content.");
  }
  if (!isAllowedIntakeFilename(opts.filename)) {
    throw new Error(
      `${opts.filename} is not an accepted intake type. Use CSV, XLSX/XLS, PDF, image, or a typical vault document (max ${INTAKE_MAX_BYTES_LABEL}).`,
    );
  }
  if (opts.bytes.length > INTAKE_MAX_BYTES) {
    throw new Error(`${fileTooLargeMessage()}. Split the file or note it for a later vault upload.`);
  }
  const intake = await getIntake(opts.intakeId);
  if (!intake) throw new Error("Intake draft not found. Save the draft, then upload again.");

  const filename = safeVaultFilename(opts.filename);
  if (isSpreadsheetFilename(filename) || (SPREADSHEET_MIME_TYPES as readonly string[]).includes(opts.mimeType)) {
    assertReadableWorkbook(opts.bytes, filename);
  }
  const classification =
    opts.classification && isDealFileClass(opts.classification)
      ? opts.classification
      : guessClassification(filename, opts.bytes);

  const created = await prisma.dealIntakeFile.create({
    data: {
      intakeId: opts.intakeId,
      source: opts.source,
      classification,
      filename,
      mimeType: opts.mimeType || "application/octet-stream",
      byteSize: opts.bytes.length,
      storagePath: "pending",
      remoteId: opts.remoteId ?? null,
      status: "uploading",
    },
  });

  try {
    const storagePath =
      opts.existingStoragePath ??
      (await putStoredFile(`_intake/${opts.intakeId}/${created.id}-${filename}`, opts.bytes, opts.mimeType));
    const saved = await prisma.dealIntakeFile.update({
      where: { id: created.id },
      data: { storagePath, status: "stored", lastError: null },
    });

    if (intake.entityId) {
      await promoteFileToVault(saved.id, intake.entityId);
    }

    return prisma.dealIntakeFile.findUniqueOrThrow({ where: { id: saved.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    await prisma.dealIntakeFile
      .update({
        where: { id: created.id },
        data: { status: "failed", lastError: message.slice(0, 500) },
      })
      .catch(() => undefined);
    await prisma.dealIntakeFile.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }
}

export async function storeIntakeFileFromBlob(opts: {
  intakeId: string;
  source: DealFileSource;
  filename: string;
  mimeType: string;
  blobUrl: string;
  classification?: string;
  byteSize?: number;
  bytes?: Buffer;
}) {
  if (!isTrustedBlobUrl(opts.blobUrl)) {
    throw new Error("That Blob URL is not a Vercel Blob object. Re-upload the file from Add Deal.");
  }
  if (opts.byteSize && opts.byteSize > INTAKE_MAX_BYTES) {
    throw new Error(`${fileTooLargeMessage()}. Split the file or note it for a later vault upload.`);
  }
  const storagePath = blobStoragePath(opts.blobUrl);
  const bytes = opts.bytes ?? (await getStoredFile(storagePath));
  return storeIntakeFile({
    intakeId: opts.intakeId,
    source: opts.source,
    filename: opts.filename,
    mimeType: opts.mimeType,
    bytes,
    classification: opts.classification,
    remoteId: opts.blobUrl,
    existingStoragePath: storagePath,
  });
}

export async function readIntakeFileBytes(fileId: string) {
  const file = await prisma.dealIntakeFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const bytes = await getStoredFile(file.storagePath);
  return { file, bytes };
}

export async function classifyIntakeFile(fileId: string, classification: string) {
  if (!isDealFileClass(classification)) throw new Error("Unknown file type. Choose a chip from the list.");
  return prisma.dealIntakeFile.update({
    where: { id: fileId },
    data: { classification },
  });
}

export async function removeIntakeFile(fileId: string) {
  const file = await prisma.dealIntakeFile.findUnique({ where: { id: fileId } });
  if (!file) return;
  await deleteStoredFile(file.storagePath);
  await prisma.dealIntakeFile.delete({ where: { id: fileId } });
}

export async function promoteFileToVault(fileId: string, entityId: string) {
  const loaded = await readIntakeFileBytes(fileId);
  if (!loaded) throw new Error("Intake file missing. Re-upload the file, then classify again.");
  if (loaded.file.vaultDocumentId) return loaded.file;
  const kind = classificationToVaultKind(loaded.file.classification);
  const doc = await storeVaultDocument({
    entityId,
    kind,
    title: loaded.file.filename,
    filename: loaded.file.filename,
    mimeType: loaded.file.mimeType,
    bytes: loaded.bytes,
    notes: `Add Deal intake (${loaded.file.source})`,
  });
  return prisma.dealIntakeFile.update({
    where: { id: fileId },
    data: { vaultDocumentId: doc.id, status: "vaulted" },
  });
}

export async function promoteIntakeFilesToVault(intakeId: string, entityId: string) {
  const files = await prisma.dealIntakeFile.findMany({ where: { intakeId } });
  const out = [];
  for (const file of files) {
    out.push(await promoteFileToVault(file.id, entityId));
  }
  return out;
}
