import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { storeVaultDocument, VAULT_MAX_BYTES, VAULT_ROOT } from "@/lib/vault";
import { safeVaultFilename, type VaultKind } from "@rcp/documents";
import { getIntake } from "./intake";
import { INTAKE_MAX_BYTES, isDealFileClass, type DealFileClass, type DealFileSource } from "./types";

export const INTAKE_ROOT = resolve(VAULT_ROOT, "_intake");

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
  if (lower.endsWith(".csv") && /rent|unit|roll/.test(lower)) return "rent_roll_csv";
  if (lower.endsWith(".csv") && /budget/.test(lower)) return "budget_csv";
  if (lower.endsWith(".csv")) return "other";
  if (/loan|note|mortgage|deed/.test(lower)) return "loan_doc";
  if (/lease/.test(lower)) return "lease";
  if (/\bom\b|cim|offering/.test(lower)) return "om_cim";
  if (/insur|binder|policy/.test(lower)) return "insurance";
  return "other";
}

function absIntakePath(storagePath: string) {
  const abs = resolve(VAULT_ROOT, storagePath);
  if (!abs.startsWith(VAULT_ROOT)) throw new Error("Invalid intake path");
  return abs;
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
  if (opts.bytes.length > INTAKE_MAX_BYTES) {
    throw new Error(`File exceeds the ${Math.round(VAULT_MAX_BYTES / (1024 * 1024))} MB intake limit. Split large files or note them for a later vault upload.`);
  }
  const intake = await getIntake(opts.intakeId);
  if (!intake) throw new Error("Intake draft not found.");

  const filename = safeVaultFilename(opts.filename);
  const classification = opts.classification && isDealFileClass(opts.classification) ? opts.classification : guessClassification(filename);

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
      status: "stored",
    },
  });

  const storagePath = `_intake/${opts.intakeId}/${created.id}-${filename}`;
  const dest = absIntakePath(storagePath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, opts.bytes);
  const saved = await prisma.dealIntakeFile.update({
    where: { id: created.id },
    data: { storagePath },
  });

  if (intake.entityId) {
    await promoteFileToVault(saved.id, intake.entityId);
  }

  return prisma.dealIntakeFile.findUniqueOrThrow({ where: { id: saved.id } });
}

export async function readIntakeFileBytes(fileId: string) {
  const file = await prisma.dealIntakeFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const bytes = await readFile(absIntakePath(file.storagePath));
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
  try {
    await unlink(absIntakePath(file.storagePath));
  } catch {
    // still delete metadata
  }
  await prisma.dealIntakeFile.delete({ where: { id: fileId } });
}

export async function promoteFileToVault(fileId: string, entityId: string) {
  const loaded = await readIntakeFileBytes(fileId);
  if (!loaded) throw new Error("Intake file missing.");
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
