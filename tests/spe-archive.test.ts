import {
  archiveImpactCopy,
  archiveSpe,
  confirmCodesMatch,
  deleteImpactCopy,
  isArchivedSpe,
  isLiveSpe,
  isPermanentDemoSpe,
  listArchivedSpes,
  permanentDemoDeleteMessage,
  restoreImpactCopy,
  restoreSpe,
} from "@/lib/archive";
import { listSpeDeals } from "@/lib/deals/create-spe";
import { createEntityWithCoa } from "@/lib/entities";
import { prisma } from "@/lib/prisma";
import { consolidationEntityIds, listEntities } from "@/lib/queries";
import { afterAll, describe, expect, it } from "vitest";

const idsToDelete: string[] = [];

afterAll(async () => {
  if (idsToDelete.length) {
    await prisma.dealIntake.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.vaultDocument.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.journalLine.deleteMany({ where: { journal: { entityId: { in: idsToDelete } } } });
    await prisma.journal.deleteMany({ where: { entityId: { in: idsToDelete } } });
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

describe("SPE Delete (soft-archive) copy", () => {
  it("explains roll-up exit and study preserve, and requires a matching SPE code", () => {
    const impact = deleteImpactCopy({ code: "SPE-WBG", name: "Willow Bend Gardens LLC" });
    expect(impact).toMatch(/leaves the OpCo combined roll-up|out of the OpCo combined roll-up/i);
    expect(impact).toMatch(/Books, ledgers, and vault documents remain/i);
    expect(impact).toMatch(/Deal Archive/i);
    expect(impact).toMatch(/not a hard wipe/i);
    expect(impact).not.toMatch(/under Deals/i);
    expect(archiveImpactCopy({ code: "SPE-WBG", name: "Willow Bend Gardens LLC" })).toBe(impact);
    expect(restoreImpactCopy({ code: "SPE-WBG", name: "Willow Bend Gardens LLC" })).toMatch(/live Deals list/i);
    expect(confirmCodesMatch("spe-wbg", "SPE-WBG")).toBe(true);
    expect(confirmCodesMatch("SPE-HCR", "SPE-WBG")).toBe(false);
    expect(isArchivedSpe({ type: "SPE", lifecycleStatus: "ARCHIVED" })).toBe(true);
    expect(isLiveSpe({ type: "SPE", lifecycleStatus: "LIVE" })).toBe(true);
    expect(isLiveSpe({ type: "OPCO", lifecycleStatus: "LIVE" })).toBe(false);
    expect(isPermanentDemoSpe("SPE-WBG")).toBe(true);
    expect(isPermanentDemoSpe("spe-hcr")).toBe(true);
    expect(isPermanentDemoSpe("SPE-HRP")).toBe(false);
    expect(permanentDemoDeleteMessage("SPE-CVC")).toMatch(/cannot be deleted/i);
  });
});

describe("SPE Delete persistence", () => {
  it("blocks permanent demo SPEs even with a matching confirm code", async () => {
    const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!wbg) throw new Error("Seed SPE-WBG before running this test (npm run db:reset)");
    await expect(archiveSpe({ code: "SPE-WBG", confirmCode: "SPE-WBG" })).rejects.toMatchObject({
      message: expect.stringMatching(/permanent demo SPE/i),
      field: "code",
    });
    await expect(archiveSpe({ code: "SPE-CVC", confirmCode: "SPE-CVC" })).rejects.toMatchObject({
      field: "code",
    });
    await expect(archiveSpe({ code: "SPE-HCR" })).rejects.toMatchObject({
      message: expect.stringMatching(/cannot be deleted/i),
    });
    expect(wbg.lifecycleStatus).toBe("LIVE");
  });

  it("archives and restores without wiping books or vault, and drops the SPE from live pickers and OpCo roll-up", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");

    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const code = `SPE-A${suffix}`.slice(0, 12);
    const entity = await createEntityWithCoa({
      code,
      name: `Archive Test ${suffix} LLC`,
      type: "SPE",
      parentId: opco.id,
      unitCount: 8,
    });
    idsToDelete.push(entity.id);

    const accountCount = await prisma.account.count({ where: { entityId: entity.id } });
    expect(accountCount).toBeGreaterThan(10);

    await prisma.vaultDocument.create({
      data: {
        entityId: entity.id,
        kind: "other",
        title: "Keep me",
        filename: "keep-me.txt",
        mimeType: "text/plain",
        byteSize: 4,
        storagePath: "fs:keep-me.txt",
      },
    });

    await expect(archiveSpe({ code, confirmCode: "SPE-NOPE" })).rejects.toMatchObject({ field: "confirmCode" });
    await expect(archiveSpe({ code: "RCP-OPCO", confirmCode: "RCP-OPCO" })).rejects.toMatchObject({
      message: expect.stringMatching(/not a property SPE/i),
    });

    const archived = await archiveSpe({ code, confirmCode: code.toLowerCase() });
    expect(archived.lifecycleStatus).toBe("ARCHIVED");
    expect(archived.archivedBy).toBe("principal");

    const liveCodes = (await listSpeDeals()).map((row) => row.code);
    expect(liveCodes).not.toContain(code);
    const pickerCodes = (await listEntities()).map((row) => row.code);
    expect(pickerCodes).not.toContain(code);
    const rollupIds = await consolidationEntityIds(opco.id);
    expect(rollupIds).not.toContain(entity.id);
    expect((await listArchivedSpes()).some((row) => row.code === code)).toBe(true);

    const { loadPeriodSnapshot } = await import("@/lib/period-snapshot");
    const { buildPack } = await import("@rcp/reporting");
    const opcoSnap = await loadPeriodSnapshot({
      entityId: opco.id,
      entityType: "OPCO",
      year: 2026,
      month: 8,
    });
    const investor = buildPack(opcoSnap, "monthly_investor");
    const concLabels = investor.charts.concentration.slices.map((s) => s.label);
    expect(concLabels).not.toContain(code);
    expect(investor.slides.some((s) => JSON.stringify(s).includes(code))).toBe(false);

    expect(await prisma.vaultDocument.count({ where: { entityId: entity.id } })).toBe(1);
    expect(await prisma.account.count({ where: { entityId: entity.id } })).toBe(accountCount);

    await expect(restoreSpe({ code, confirmCode: "WRONG" })).rejects.toMatchObject({ field: "confirmCode" });
    const restored = await restoreSpe({ code, confirmCode: code });
    expect(restored.lifecycleStatus).toBe("LIVE");
    expect(restored.restoredBy).toBe("principal");
    expect((await listSpeDeals()).some((row) => row.code === code)).toBe(true);
    expect(await consolidationEntityIds(opco.id)).toContain(entity.id);
  });
});
