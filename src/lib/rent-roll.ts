import type { UnitStatus } from "@prisma/client";
import { parseRentRollCsv, serializeRentRollCsv, type UnitSnapshot } from "@rcp/properties";
import { assertReplaceConfirmed } from "./import-guard";
import { prisma } from "./prisma";

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

export async function importRentRollCsv(opts: {
  entityId: string;
  csv: string;
  asOfDate?: Date;
  confirmReplace?: boolean;
}) {
  const existingCount = await prisma.unit.count({ where: { entityId: opts.entityId } });
  assertReplaceConfirmed({ existingCount, confirmReplace: opts.confirmReplace, kind: "rent-roll" });
  const units = parseRentRollCsv(opts.csv);
  await replaceRentRoll({
    entityId: opts.entityId,
    units,
    asOfDate: opts.asOfDate ?? new Date(),
  });
  return units;
}

export async function exportRentRollCsv(entityId: string): Promise<string> {
  const units = await loadUnits([entityId]);
  return serializeRentRollCsv(units);
}
