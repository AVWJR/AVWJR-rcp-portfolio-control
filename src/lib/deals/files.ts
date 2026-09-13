import { prisma } from "@/lib/prisma";
import { deleteStoredFile, getStoredFile, putStoredFile } from "@/lib/file-store";
import { storeVaultDocument, VAULT_MAX_BYTES } from "@/lib/vault";
import { safeVaultFilename, type VaultKind } from "@rcp/documents";
import { getIntake } from "./intake";
import { INTAKE_MAX_BYTES, isDealFileClass, type DealFileClass, type DealFileSource } from "./types";
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
    default:
      return "other";
  }
}

export function guessClassification(filename: string): DealFileClass {
  const lower = filename.toLowerCase();
  const tabular = lower.endsWith(".csv") || isSpreadsheetFilename(filename);
  if (tabular && /rent|unit|roll/.test(lower)) return "rent_roll_csv";
  if (tabular && /budget/.test(lower)) return "budget_csv";
  if (tabular) return "other";
  if (/loan|note|mortgage|deed/.test(lower)) return "loan_doc";
  if (/lease/.test(lower)) return "lease";
  if (/\bom\b|cim|offering/.test(lower)) return "om_cim";
  if (/insur|binder|policy/.test(lower)) return "insurance";
  return "other";
}

export async function storeIntakeFile(opts: {
  intakeId: string;
  source: DealFileSource;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  classification?: string;
  remoteId?: string;
}) {
  if (opts.bytes.length === 0) {
    throw new Error("The file is empty. Choose a rent-roll CSV, XLSX, or PDF that has content.");
  }
  if (!isAllowedIntakeFilename(opts.filename)) {
    throw new Error(
      `${opts.filename} is not an accepted intake type. Use CSV, XLSX/XLS, PDF, image, or a typical vault document (max ${Math.round(VAULT_MAX_BYTES / (1024 * 1024))} MB).`,
    );
  }
  if (opts.bytes.length > INTAKE_MAX_BYTES) {
    throw new Error(
      `File exceeds the ${Math.round(VAULT_MAX_BYTES / (1024 * 1024))} MB intake limit. Split large files or note them for a later vault upload.`,
    );
  }
  const intake = await getIntake(opts.intakeId);
  if (!intake) throw new Error("Intake draft not found. Save the draft, then upload again.");

  const filename = safeVaultFilename(opts.filename);
  if (isSpreadsheetFilename(filename) || (SPREADSHEET_MIME_TYPES as readonly string[]).includes(opts.mimeType)) {
    assertReadableWorkbook(opts.bytes, filename);
  }
  const classification =
    opts.classification && isDealFileClass(opts.classification) ? opts.classification : guessClassification(filename);

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
    const storagePath = await putStoredFile(
      `_intake/${opts.intakeId}/${created.id}-${filename}`,
      opts.bytes,
      opts.mimeType,
    );
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
