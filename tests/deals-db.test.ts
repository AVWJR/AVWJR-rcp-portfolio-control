import { applyCreateEntity, applyStructuredData } from "@/lib/deals/apply";
import { createSpeDeal, validateCreateSpe } from "@/lib/deals/create-spe";
import { promoteIntakeFilesToVault, storeIntakeFile } from "@/lib/deals/files";
import { createIntake, getIntake, updateIntake } from "@/lib/deals/intake";
import { DealValidationError } from "@/lib/deals/create-spe";
import { prisma } from "@/lib/prisma";
import { listVaultDocuments } from "@/lib/vault";
import { afterAll, describe, expect, it } from "vitest";

const idsToDelete: string[] = [];
const intakeIds: string[] = [];

afterAll(async () => {
  if (intakeIds.length) {
    await prisma.dealIntakeFile.deleteMany({ where: { intakeId: { in: intakeIds } } });
    await prisma.dealIntake.deleteMany({ where: { id: { in: intakeIds } } });
  }
  if (idsToDelete.length) {
    await prisma.dealIntake.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.vaultDocument.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.storedBlob.deleteMany({ where: { key: { contains: "_intake/" } } });
    await prisma.loan.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.unit.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.budgetLine.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: { in: idsToDelete } } } });
    await prisma.period.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.account.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.entity.deleteMany({ where: { id: { in: idsToDelete } } });
  }
  await prisma.$disconnect();
});

describe("create SPE validation", () => {
  it("rejects a duplicate code and a missing parent", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");

    await expect(validateCreateSpe({ name: "Willow Bend Gardens LLC", code: "SPE-WBG" })).rejects.toBeInstanceOf(
      DealValidationError,
    );
    await expect(
      validateCreateSpe({ name: "Ghost SPE LLC", code: "SPE-ZZZ", parentOpCoCode: "NO-SUCH-OPCO" }),
    ).rejects.toMatchObject({ field: "parentOpCoCode" });
    await expect(validateCreateSpe({ name: "", code: "SPE-OK" })).rejects.toMatchObject({ field: "speName" });
  });
});

describe("intake draft + upload to vault", () => {
  it("persists a draft, stores a file, creates the SPE, and lands the blob in the vault", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");

    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const code = `SPE-T${suffix}`.slice(0, 12);
    const intake = await createIntake({
      goal: "stabilize",
      targetPeriod: "2026-08",
      speName: `Test Terrace ${suffix} LLC`,
      speCode: code,
      unitCount: 12,
      parentOpCoCode: "RCP-OPCO",
      sources: ["upload"],
    });
    intakeIds.push(intake.id);
    expect(intake.status).toBe("DRAFT");

    const updated = await updateIntake(intake.id, { currentStep: 3, speName: intake.speName });
    expect(updated.id).toBe(intake.id);
    expect(["AWAITING_FILES", "READY", "DRAFT"]).toContain(updated.status);

    const csv = `unit_id,floorplan,beds,baths,sqft,status,market_rent,in_place_rent,lease_start,lease_end,concession
101,A1,1,1.0,700,OCCUPIED,1285.00,1240.00,2025-09-01,2026-08-31,25.00
`;
    const file = await storeIntakeFile({
      intakeId: intake.id,
      source: "upload",
      filename: "test-rent-roll.csv",
      mimeType: "text/csv",
      bytes: Buffer.from(csv),
      classification: "rent_roll_csv",
    });
    expect(file.classification).toBe("rent_roll_csv");

    const created = await applyCreateEntity(intake.id);
    expect(created?.entity?.code).toBe(code);
    if (created?.entityId) idsToDelete.push(created.entityId);

    const vaulted = await promoteIntakeFilesToVault(intake.id, created!.entityId!);
    expect(vaulted[0]?.vaultDocumentId).toBeTruthy();
    const docs = await listVaultDocuments(created!.entityId!);
    expect(docs.some((d) => d.filename.includes("test-rent-roll") && d.kind === "rent_roll")).toBe(true);

    const period = await prisma.period.findUnique({
      where: { entityId_year_month: { entityId: created!.entityId!, year: 2026, month: 8 } },
    });
    expect(period?.status).toBe("OPEN");

    const applied = await applyStructuredData({
      intakeId: intake.id,
      confirmReplace: true,
      importRentRoll: true,
      importBudget: false,
      saveLoan: false,
    });
    expect(applied.results.some((row) => row.kind === "rent_roll" && row.imported === 1)).toBe(true);
    const units = await prisma.unit.count({ where: { entityId: created!.entityId! } });
    expect(units).toBe(1);

    const latest = await getIntake(intake.id);
    expect(latest?.status).toBe("APPLIED");
  });

  it("creates an SPE under OpCo through the shared helper", async () => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-3);
    const { entity, parent } = await createSpeDeal({
      name: `Cursor Court ${suffix} LLC`,
      code: `SPE-C${suffix}`,
      unitCount: 24,
      goal: "light_rehab",
      targetPeriod: "2026-08",
    });
    idsToDelete.push(entity.id);
    expect(parent.code).toBe("RCP-OPCO");
    expect(entity.type).toBe("SPE");
    const accounts = await prisma.account.count({ where: { entityId: entity.id } });
    expect(accounts).toBeGreaterThan(20);
  });
});
