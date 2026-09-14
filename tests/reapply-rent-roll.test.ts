import { createSpeDeal } from "@/lib/deals/create-spe";
import { reapplyRentRollForEntity } from "@/lib/deals/reapply";
import { prisma } from "@/lib/prisma";
import { storeVaultDocument } from "@/lib/vault";
import { CANONICAL_WORKBOOK_FILENAME } from "@/lib/rent-roll-workbook";
import { afterAll, describe, expect, it } from "vitest";
import { HAMPTON_LEASE_CHARGES_UNIT_COUNT, hamptonLeaseChargesWorkbook } from "./fixtures/hampton-lease-charges";
import {
  HARRINGTON_REDIQ_UNIT_COUNT,
  harringtonRediqRentRollWorkbook,
  unmappableWorkbook,
} from "./fixtures/harrington-rent-roll";

const entityIds: string[] = [];
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

afterAll(async () => {
  if (entityIds.length) {
    await prisma.dealIntake.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.vaultDocument.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.unit.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: { in: entityIds } } } });
    await prisma.period.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.account.deleteMany({ where: { entityId: { in: entityIds } } });
    await prisma.entity.deleteMany({ where: { id: { in: entityIds } } });
  }
  await prisma.$disconnect();
});

async function newSpe(label: string) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase().slice(-5);
  const { entity } = await createSpeDeal({
    name: `${label} ${suffix} LLC`,
    code: `SPE-${suffix}`.slice(0, 12),
    unitCount: null,
    goal: "value_add",
    targetPeriod: "2026-08",
  });
  entityIds.push(entity.id);
  return entity;
}

async function vaultAsOther(opts: { entityId: string; filename: string; bytes: Buffer; title?: string }) {
  const stored = await storeVaultDocument({
    entityId: opts.entityId,
    kind: "other",
    title: opts.title ?? opts.filename,
    filename: opts.filename,
    mimeType: XLSX,
    bytes: opts.bytes,
  });
  return prisma.vaultDocument.update({
    where: { id: stored.id },
    data: { kind: "other" },
  });
}

describe("re-apply vaulted rent roll when Kind is Other", () => {
  it("maps a Hampton-like *RR* workbook stored as Other and backfills kind", async () => {
    const entity = await newSpe("Hampton Terrace");
    await vaultAsOther({
      entityId: entity.id,
      filename: "Hampton - June 2026 T-12 Operating Statement.xlsx",
      bytes: unmappableWorkbook(),
    });
    const rr = await vaultAsOther({
      entityId: entity.id,
      filename: "Hampton - RR 07.08.26.xlsx",
      bytes: hamptonLeaseChargesWorkbook(),
    });
    expect(rr.kind).toBe("other");
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(0);

    const report = await reapplyRentRollForEntity(entity.code);
    expect(report.imported).toBe(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    expect(report.source).toBe("Hampton - RR 07.08.26.xlsx");
    expect(report.dialect).toBe("yardi_lease_charges");
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    const spe = await prisma.entity.findUnique({ where: { id: entity.id } });
    expect(spe?.unitCount).toBe(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    const original = await prisma.vaultDocument.findUnique({ where: { id: rr.id } });
    expect(original?.kind).toBe("rent_roll");
    const canonical = await prisma.vaultDocument.findFirst({
      where: { entityId: entity.id, filename: CANONICAL_WORKBOOK_FILENAME },
    });
    expect(canonical).toBeTruthy();
  });

  it("maps Kind Other when the vault title has RR even if the filename does not", async () => {
    const entity = await newSpe("Hampton Title");
    await vaultAsOther({
      entityId: entity.id,
      filename: "Hampton Gardens.xlsx",
      title: "Hampton - RR 07.08.26.xlsx",
      bytes: hamptonLeaseChargesWorkbook(),
    });
    const report = await reapplyRentRollForEntity(entity.code);
    expect(report.imported).toBe(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
    expect(report.dialect).toBe("yardi_lease_charges");
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(HAMPTON_LEASE_CHARGES_UNIT_COUNT);
  });

  it("still re-applies a kind=rent_roll redIQ workbook", async () => {
    const entity = await newSpe("Harrington Court");
    await storeVaultDocument({
      entityId: entity.id,
      kind: "rent_roll",
      title: "Harrington redIQ RR",
      filename: "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
      mimeType: XLSX,
      bytes: harringtonRediqRentRollWorkbook(),
    });
    const report = await reapplyRentRollForEntity(entity.code);
    expect(report.imported).toBe(HARRINGTON_REDIQ_UNIT_COUNT);
    expect(report.dialect).toBe("redi_q_machine");
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(HARRINGTON_REDIQ_UNIT_COUNT);
  });

  it("surfaces could-not-map-columns when an *RR* workbook has no unit rows", async () => {
    const entity = await newSpe("Mystery Terrace");
    await vaultAsOther({
      entityId: entity.id,
      filename: "Hampton - RR 07.08.26.xlsx",
      bytes: unmappableWorkbook(),
    });
    await expect(reapplyRentRollForEntity(entity.code)).rejects.toThrow(
      /could not map columns[\s\S]*Detected headers/i,
    );
    expect(await prisma.unit.count({ where: { entityId: entity.id } })).toBe(0);
  });
});
