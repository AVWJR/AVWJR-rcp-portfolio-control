import type { UnitStatus } from "@prisma/client";
import {
  canonicalUnitToSnapshot,
  dialectCoachLine,
  parseRentRollCsv,
  serializeRentRollCsv,
  type NormalizedRentRoll,
  type UnitSnapshot,
} from "@rcp/properties";
import { pickOriginalRentRollMeta } from "@/lib/deals/rent-roll-candidates";
import { parseRentRollSource, type ParsedRentRollSource } from "@/lib/deals/workbook";
import { deleteStoredFile, putStoredFile } from "@/lib/file-store";
import { assertReplaceConfirmed } from "./import-guard";
import { prisma } from "./prisma";
import { storeVaultDocument } from "./vault";
import { buildCanonicalRentRollWorkbook, CANONICAL_WORKBOOK_FILENAME } from "./rent-roll-workbook";

export const CANONICAL_RENT_ROLL_KIND_NOTE = "canonical_template";

export function unitToSnapshot(row: {
  unitCode: string;
  floorplan: string;
  beds: number;
  bathsTenths: number;
  sqft: number;
  status: UnitStatus;
  marketRent: bigint;
  inPlaceRent: bigint;
  leaseStart: Date | null;
  leaseEnd: Date | null;
  concessionCents: bigint;
}): UnitSnapshot {
  return {
    unitCode: row.unitCode,
    floorplan: row.floorplan,
    beds: row.beds,
    bathsTenths: row.bathsTenths,
    sqft: row.sqft,
    status: row.status,
    marketRent: row.marketRent,
    inPlaceRent: row.inPlaceRent,
    leaseStart: row.leaseStart,
    leaseEnd: row.leaseEnd,
    concessionCents: row.concessionCents,
  };
}

export async function loadUnits(entityIds: string[]): Promise<UnitSnapshot[]> {
  const rows = await prisma.unit.findMany({
    where: { entityId: { in: entityIds } },
    orderBy: [{ entityId: "asc" }, { unitCode: "asc" }],
  });
  return rows.map(unitToSnapshot);
}

export async function replaceRentRoll(opts: {
  entityId: string;
  units: UnitSnapshot[];
  asOfDate: Date;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.unit.deleteMany({ where: { entityId: opts.entityId } });
    if (opts.units.length === 0) return;
    await tx.unit.createMany({
      data: opts.units.map((u) => ({
        entityId: opts.entityId,
        unitCode: u.unitCode,
        floorplan: u.floorplan,
        beds: u.beds,
        bathsTenths: u.bathsTenths,
        sqft: u.sqft,
        status: u.status,
        marketRent: u.marketRent,
        inPlaceRent: u.inPlaceRent,
        leaseStart: u.leaseStart,
        leaseEnd: u.leaseEnd,
        concessionCents: u.concessionCents,
        asOfDate: opts.asOfDate,
      })),
    });
  });
  return opts.units.length;
}

export type RentRollImportResult = {
  units: UnitSnapshot[];
  normalized: NormalizedRentRoll;
  dialect: string;
  dialectLabel: string;
  canonicalDocumentId?: string;
};

export function asOfDateFromNormalized(normalized: NormalizedRentRoll, fallback?: Date): Date {
  if (normalized.meta.asOfDate) {
    const parsed = new Date(`${normalized.meta.asOfDate}T16:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback ?? new Date();
}

function canonicalNotes(normalized: NormalizedRentRoll, originalFilename: string): string {
  const payload = {
    kind: CANONICAL_RENT_ROLL_KIND_NOTE,
    dialect: normalized.meta.dialect,
    dialectLabel: normalized.meta.dialectLabel,
    unitCount: normalized.units.length,
    chargeCount: normalized.charges.length,
    unmappedCount: normalized.unmapped.length,
    asOf: normalized.meta.asOfDate,
    propertyName: normalized.meta.propertyName,
    originalFilename,
  };
  return `${dialectCoachLine(normalized.meta)} Original workbook bytes are retained in Vault. ${JSON.stringify(payload)}`;
}

export function parseCanonicalNotes(notes: string | null | undefined): {
  dialect?: string;
  dialectLabel?: string;
  unitCount?: number;
  originalFilename?: string;
} | null {
  if (!notes) return null;
  const json = notes.match(/\{[\s\S]*\}$/);
  if (!json) return null;
  try {
    return JSON.parse(json[0]!) as {
      dialect?: string;
      dialectLabel?: string;
      unitCount?: number;
      originalFilename?: string;
    };
  } catch {
    return null;
  }
}

export async function persistCanonicalRentRoll(opts: {
  entityId: string;
  source: ParsedRentRollSource;
}) {
  const bytes = buildCanonicalRentRollWorkbook({
    normalized: opts.source.normalized,
    originalSheets: opts.source.originalSheets,
    selectedSheet: opts.source.selectedSheet,
  });
  const notes = canonicalNotes(opts.source.normalized, opts.source.filename);
  const existing = await prisma.vaultDocument.findFirst({
    where: { entityId: opts.entityId, filename: CANONICAL_WORKBOOK_FILENAME },
    orderBy: { uploadedAt: "desc" },
  });
  const entity = await prisma.entity.findUnique({ where: { id: opts.entityId } });
  if (!entity) throw new Error("Unknown entity");
  if (existing) {
    await deleteStoredFile(existing.storagePath);
    const storagePath = await putStoredFile(
      `${entity.code}/${existing.id}-${CANONICAL_WORKBOOK_FILENAME}`,
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await prisma.vaultDocument.update({
      where: { id: existing.id },
      data: {
        title: "Canonical rent roll template",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storagePath,
        byteSize: bytes.length,
        notes,
      },
    });
    return existing.id;
  }
  const created = await storeVaultDocument({
    entityId: opts.entityId,
    kind: "rent_roll",
    title: "Canonical rent roll template",
    filename: CANONICAL_WORKBOOK_FILENAME,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
    notes,
  });
  return created.id;
}

export async function annotateOriginalRentRoll(opts: {
  vaultDocumentId?: string | null;
  normalized: NormalizedRentRoll;
  originalFilename: string;
}) {
  if (!opts.vaultDocumentId) return;
  const notes = `Original rent-roll audit copy (bytes unchanged). ${canonicalNotes(opts.normalized, opts.originalFilename)}`;
  await prisma.vaultDocument.update({
    where: { id: opts.vaultDocumentId },
    data: { notes, kind: "rent_roll" },
  });
}

export async function importRentRollSource(opts: {
  entityId: string;
  filename: string;
  mimeType?: string;
  bytes: Buffer;
  asOfDate?: Date;
  confirmReplace?: boolean;
  originalVaultDocumentId?: string | null;
}): Promise<RentRollImportResult> {
  const existingCount = await prisma.unit.count({ where: { entityId: opts.entityId } });
  assertReplaceConfirmed({ existingCount, confirmReplace: opts.confirmReplace, kind: "rent-roll" });
  const source = parseRentRollSource({
    filename: opts.filename,
    mimeType: opts.mimeType,
    bytes: opts.bytes,
  });
  const units = source.normalized.units.map(canonicalUnitToSnapshot);
  if (!units.length) {
    throw new Error(`could not map columns: unit rows. Detected headers: (none)`);
  }
  await replaceRentRoll({
    entityId: opts.entityId,
    units,
    asOfDate: asOfDateFromNormalized(source.normalized, opts.asOfDate),
  });
  const canonicalDocumentId = await persistCanonicalRentRoll({ entityId: opts.entityId, source });
  await annotateOriginalRentRoll({
    vaultDocumentId: opts.originalVaultDocumentId,
    normalized: source.normalized,
    originalFilename: opts.filename,
  });
  return {
    units,
    normalized: source.normalized,
    dialect: source.normalized.meta.dialect,
    dialectLabel: source.normalized.meta.dialectLabel,
    canonicalDocumentId,
  };
}

export async function importRentRollCsv(opts: {
  entityId: string;
  csv: string;
  asOfDate?: Date;
  confirmReplace?: boolean;
}) {
  const imported = await importRentRollSource({
    entityId: opts.entityId,
    filename: "rent-roll.csv",
    mimeType: "text/csv",
    bytes: Buffer.from(opts.csv, "utf8"),
    asOfDate: opts.asOfDate,
    confirmReplace: opts.confirmReplace,
  });
  return imported.units;
}

export async function exportRentRollCsv(entityId: string): Promise<string> {
  const units = await loadUnits([entityId]);
  return serializeRentRollCsv(units);
}

export async function loadCanonicalRentRollDocument(entityId: string) {
  return prisma.vaultDocument.findFirst({
    where: { entityId, filename: CANONICAL_WORKBOOK_FILENAME },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function loadOriginalRentRollDocument(entityId: string) {
  const docs = await prisma.vaultDocument.findMany({
    where: { entityId },
    orderBy: { uploadedAt: "desc" },
  });
  return pickOriginalRentRollMeta(docs) ?? null;
}

export { parseRentRollCsv };
