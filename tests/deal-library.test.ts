import { rankChips } from "@/lib/expert/actions";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { listNavTargets, readExpertContext } from "@/lib/expert/nav";
import { EXPERT_SYSTEM_PROMPT } from "@/lib/expert/system-prompt";
import { archiveSpe } from "@/lib/archive";
import { changeDealStatus, effectiveDealStatus } from "@/lib/deal-status";
import { createEntityWithCoa } from "@/lib/entities";
import { postJournal } from "@/lib/post-journal";
import { openPeriod } from "@/lib/deals/periods";
import { buildOpCoDashboard } from "@/lib/dashboards";
import { consolidationEntityIds } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { postBrokerT12OverlayJournals } from "@/lib/t12-overlay";
import {
  LIBRARY_COLUMNS,
  defaultColumnLayout,
  moveColumn,
  normalizeColumnLayout,
} from "@/lib/library/columns";
import {
  blankCriterion,
  evaluateCriterion,
  evaluateDeal,
  parseCriteria,
  passCount,
  type LibraryFact,
} from "@/lib/library/criteria";
import { FEE_NEEDED, dealFeeNeededLabel, opcoFeeNeededLabel } from "@/lib/library/fees";
import {
  PICK_METRO,
  PICK_PROPERTY_TYPE,
  PICK_STATE,
  SEEDED_PROPERTY_TYPES,
  SEEDED_STATES,
  addPickItem,
  ensureLibraryPickLists,
  listPickItems,
  removePickItem,
} from "@/lib/library/pick-lists";
import { loadCriteriaPreset, saveCriteriaPreset } from "@/lib/library/presets";
import { loadOpcoGaBudgetCents, updateDealLibrary, updateOpcoGaBudget } from "@/lib/library/profile";
import { backfillDealSnapshots, captureDealSnapshot } from "@/lib/library/snapshot";
import { analysisStaleLevel, staleFlagLabel } from "@/lib/library/staleness";
import type { T12WorkbookParse } from "@rcp/properties";
import { afterAll, describe, expect, it } from "vitest";

const idsToDelete: string[] = [];
const presetIds: string[] = [];
const pickIds: string[] = [];
const snapshotActors = ["library-test", "library-backfill"];

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

function fact(over: Partial<LibraryFact> = {}): LibraryFact {
  return {
    code: "SPE-X",
    dscrBps: 12_500,
    debtYieldBps: 800,
    capRateBps: 500,
    ltvBps: 7_500,
    cashOnCashBps: 600,
    occupancyBps: 9_000,
    expenseRatioBps: 4_500,
    pricePerUnitCents: 20_000_000,
    unitCount: 100,
    lpNetIrrBps: null,
    lpCashYieldBps: null,
    rcpIrrBps: null,
    state: "GA",
    metro: "Atlanta",
    msa: null,
    submarket: null,
    city: null,
    propertyType: "Garden",
    assetClass: "B",
    vintageYear: 1990,
    businessPlan: "Value-add",
    prefRateBps: 800,
    catchUpBps: 5_000,
    coGpBps: 0,
    equityRequiredCents: 100_000_000,
    dealStatus: "OWNED",
    feeNeeded: true,
    ...over,
  };
}

function hard(field: Parameters<typeof blankCriterion>[0], operator: "gte" | "gt" | "lte" | "lt" | "eq" | "in" | "not_in", value: number | string[]) {
  const row = blankCriterion(field, `c_${field}`);
  return { ...row, operator, value, role: "HARD_LIMIT" as const };
}

afterAll(async () => {
  if (snapshotActors.length) {
    await prisma.dealAnalysisSnapshot.deleteMany({ where: { recordedBy: { in: snapshotActors } } });
  }
  if (presetIds.length) {
    await prisma.criteriaPreset.deleteMany({ where: { id: { in: presetIds } } });
  }
  if (pickIds.length) {
    await prisma.libraryPickItem.deleteMany({ where: { id: { in: pickIds } } });
  }
  if (idsToDelete.length) {
    await prisma.dealStatusEvent.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.dealAnalysisSnapshot.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.distributionAllocation.deleteMany({ where: { event: { entityId: { in: idsToDelete } } } });
    await prisma.distributionAudit.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.distributionEvent.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.journalLine.deleteMany({ where: { journal: { entityId: { in: idsToDelete } } } });
    await prisma.journal.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: { in: idsToDelete } } } });
    await prisma.period.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.account.deleteMany({ where: { entityId: { in: idsToDelete } } });
    await prisma.entity.deleteMany({ where: { id: { in: idsToDelete } } });
  }
  const opco = await prisma.entity.findFirst({ where: { type: "OPCO" }, orderBy: { code: "asc" } });
  if (opco?.gaBudgetCents != null) {
    await prisma.entity.update({ where: { id: opco.id }, data: { gaBudgetCents: null } });
  }
  await prisma.$disconnect();
});

describe("deal status fallback and roll-up", () => {
  it("reads a missing dealStatus as Owned and an archived lifecycle as Archived", () => {
    expect(effectiveDealStatus({ lifecycleStatus: "LIVE", dealStatus: null })).toBe("OWNED");
    expect(effectiveDealStatus({ lifecycleStatus: "LIVE" })).toBe("OWNED");
    expect(effectiveDealStatus({ lifecycleStatus: "ARCHIVED", dealStatus: "OWNED" })).toBe("ARCHIVED");
    expect(effectiveDealStatus({ lifecycleStatus: "LIVE", dealStatus: "TEST" })).toBe("TEST");
  });

  it("keeps seeded live deals Owned and archived deals Archived without rewriting the column", async () => {
    const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!wbg) throw new Error("Seed SPE-WBG before running this test (npm run db:reset)");
    expect(wbg.lifecycleStatus).toBe("LIVE");
    expect(wbg.dealStatus).toBe("OWNED");
    expect(effectiveDealStatus(wbg)).toBe("OWNED");
    expect(wbg.amFeeBps).toBeNull();
    expect(wbg.otherLpFeeCents).toBeNull();

    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const suffix = Date.now().toString(36).toUpperCase().slice(-5);
    const code = `SPE-Z${suffix}`.slice(0, 12);
    const entity = await createEntityWithCoa({
      code,
      name: `Fallback ${suffix} LLC`,
      type: "SPE",
      parentId: opco.id,
      unitCount: 4,
    });
    idsToDelete.push(entity.id);
    expect(entity.dealStatus).toBe("OWNED");
    await archiveSpe({ code, confirmCode: code });
    const archived = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(archived.lifecycleStatus).toBe("ARCHIVED");
    expect(archived.dealStatus).toBe("OWNED");
    expect(effectiveDealStatus(archived)).toBe("ARCHIVED");
  });

  it("keeps a pipeline deal with journals out of the OpCo roll-up", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const suffix = Date.now().toString(36).toUpperCase().slice(-5);
    const code = `SPE-P${suffix}`.slice(0, 12);
    const entity = await createEntityWithCoa({
      code,
      name: `Pipeline ${suffix} LLC`,
      type: "SPE",
      parentId: opco.id,
      unitCount: 12,
      dealStatus: "PIPELINE",
    });
    idsToDelete.push(entity.id);
    const period = await openPeriod(entity.id, 2026, 8);
    await postJournal({
      entityId: entity.id,
      periodId: period.id,
      date: new Date("2026-08-31T16:00:00.000Z"),
      memo: "Pipeline rent that must not hit OpCo",
      source: "library-test",
      lines: [
        { accountCode: "1110", debit: 5_000_000n, credit: 0n },
        { accountCode: "4010", debit: 0n, credit: 5_000_000n },
      ],
    });
    const journals = await prisma.journal.count({ where: { entityId: entity.id, status: "POSTED" } });
    expect(journals).toBe(1);

    const posted = await postBrokerT12OverlayJournals({
      entityId: entity.id,
      year: 2026,
      month: 8,
      filename: "broker-t12.xlsx",
      parsed: {
        sheet: "T12",
        monthCount: 12,
        gpr: 1_200_000n,
        vacancy: 0n,
        concessions: 0n,
        otherIncome: 0n,
        lines: [],
      } as unknown as T12WorkbookParse,
    });
    expect(posted).toBe(0);
    expect(await prisma.journal.count({ where: { entityId: entity.id } })).toBe(1);

    const { buildOperatingPackage } = await import("@/lib/operating");
    const own = await buildOperatingPackage({
      entityId: entity.id,
      year: 2026,
      month: 8,
      consolidated: false,
    });
    expect(own.operating.actual.noi).toBe(5_000_000n);

    const after = await buildOpCoDashboard({ opcoId: opco.id, year: 2026, month: 8 });
    const codes = after.properties.map((row) => row.entityCode);
    expect(codes).toContain("SPE-WBG");
    expect(codes).not.toContain(code);
    const ids = await consolidationEntityIds(opco.id);
    expect(ids).not.toContain(entity.id);
    expect(ids).toContain(
      (await prisma.entity.findUniqueOrThrow({ where: { code: "SPE-WBG" } })).id,
    );
  });
});

describe("status changes that stay blocked", () => {
  it("refuses to move permanent demo deals out of Owned", async () => {
    for (const code of ["SPE-WBG", "SPE-CVC", "SPE-HCR"]) {
      await expect(
        changeDealStatus({ code, toStatus: "TEST", reason: "phase 1 check", confirmRollup: true }),
      ).rejects.toThrow(/permanent demo|Phase 4/i);
      const row = await prisma.entity.findUniqueOrThrow({ where: { code } });
      expect(row.dealStatus).toBe("OWNED");
      expect(row.lifecycleStatus).toBe("LIVE");
    }
  });

  it("blocks leaving Owned when a month is closed or a distribution is posted", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const suffix = Date.now().toString(36).toUpperCase().slice(-5);
    const code = `SPE-L${suffix}`.slice(0, 12);
    const entity = await createEntityWithCoa({
      code,
      name: `Lock ${suffix} LLC`,
      type: "SPE",
      parentId: opco.id,
      unitCount: 6,
    });
    idsToDelete.push(entity.id);
    expect(entity.dealStatus).toBe("OWNED");

    const period = await openPeriod(entity.id, 2026, 1);
    await prisma.period.update({ where: { id: period.id }, data: { status: "CLOSED" } });
    await expect(
      changeDealStatus({ code, toStatus: "PIPELINE", reason: "try closed month", confirmRollup: true }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } })).dealStatus).toBe("OWNED");

    await prisma.period.update({ where: { id: period.id }, data: { status: "OPEN" } });
    await prisma.distributionEvent.create({
      data: {
        entityId: entity.id,
        eventDate: new Date("2026-08-15T16:00:00.000Z"),
        year: 2026,
        month: 8,
        periodLabel: "2026-08",
        grossCents: 100n,
        source: "OPERATING_CASH",
        waterfallSnapshotJson: "{}",
        sequence: 1,
        capitalContributedCents: 0n,
        capitalReturnedCents: 0n,
        unreturnedCapitalCents: 0n,
        prefAccruedCents: 0n,
        prefPaidCents: 0n,
        prefUnpaidCents: 0n,
        catchUpPaidCents: 0n,
        catchUpTargetCents: 0n,
        promoteEarnedCents: 0n,
        cumulativeLpCents: 0n,
        cumulativeRcpCents: 0n,
        cumulativeCoGpCents: 0n,
      },
    });
    await expect(
      changeDealStatus({ code, toStatus: "SCREENED", reason: "try distribution", confirmRollup: true }),
    ).rejects.toThrow(/posted distribution|closed month/i);
    expect((await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } })).dealStatus).toBe("OWNED");

    await prisma.distributionEvent.deleteMany({ where: { entityId: entity.id } });
    await expect(
      changeDealStatus({ code, toStatus: "ARCHIVED", reason: "not this screen" }),
    ).rejects.toThrow(/Deal Archive|does not archive/i);

    const moved = await changeDealStatus({
      code,
      toStatus: "PIPELINE",
      reason: "books are open",
      confirmRollup: true,
    });
    expect(moved.toStatus).toBe("PIPELINE");
    await expect(
      changeDealStatus({ code, toStatus: "OWNED", reason: "closed" }),
    ).rejects.toThrow(/Confirm that RCP has closed/i);
    const owned = await changeDealStatus({
      code,
      toStatus: "OWNED",
      reason: "closed",
      confirmOwned: true,
    });
    expect(owned.toStatus).toBe("OWNED");
    await changeDealStatus({
      code,
      toStatus: "TEST",
      reason: "leave the books before cleanup",
      confirmRollup: true,
    });
  });
});

describe("analysis snapshots stay append-only", () => {
  it("stores Phase 2 returns as null and keeps the prior row", async () => {
    const wbg = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!wbg) throw new Error("Seed SPE-WBG before running this test (npm run db:reset)");
    const first = await captureDealSnapshot({
      entityId: wbg.id,
      year: 2026,
      month: 8,
      actor: "library-test",
    });
    expect(first.lpNetIrrBps).toBeNull();
    expect(first.lpAvgCashYieldBps).toBeNull();
    expect(first.lpYear1CashYieldBps).toBeNull();
    expect(first.rcpIrrBps).toBeNull();
    expect(first.basisLabel.length).toBeGreaterThan(0);
    expect(first.noiBasisLabel.length).toBeGreaterThan(0);
    expect(first.dscrBps).not.toBeNull();

    const second = await captureDealSnapshot({
      entityId: wbg.id,
      year: 2026,
      month: 8,
      actor: "library-test",
    });
    expect(second.id).not.toBe(first.id);
    expect(await prisma.dealAnalysisSnapshot.findUnique({ where: { id: first.id } })).not.toBeNull();

    const before = await prisma.dealAnalysisSnapshot.count({ where: { entityId: wbg.id } });
    const saved = await backfillDealSnapshots({
      year: 2026,
      month: 8,
      actor: "library-backfill",
      entityIds: [wbg.id],
    });
    expect(saved).toHaveLength(1);
    const after = await prisma.dealAnalysisSnapshot.count({ where: { entityId: wbg.id } });
    expect(after).toBeGreaterThan(before);
    expect(await prisma.dealAnalysisSnapshot.findUnique({ where: { id: first.id } })).not.toBeNull();
  });
});

describe("criteria, presets, columns, stale flags, fees, and pick lists", () => {
  it("evaluates each operator and ignores preferences", () => {
    const row = fact();
    expect(evaluateCriterion(row, hard("dscr", "gte", 1.25))).toBeNull();
    expect(evaluateCriterion(row, hard("dscr", "gt", 1.25))?.reason).toMatch(/DSCR/);
    expect(evaluateCriterion(row, hard("dscr", "lte", 1.25))).toBeNull();
    expect(evaluateCriterion(row, hard("dscr", "lt", 1.25))?.reason).toMatch(/DSCR/);
    expect(evaluateCriterion(row, hard("dscr", "eq", 1.25))).toBeNull();
    expect(evaluateCriterion(row, hard("ltv", "lte", 75))).toBeNull();
    expect(evaluateCriterion(row, hard("ltv", "lt", 75))?.reason).toMatch(/LTV/);
    expect(evaluateCriterion(row, hard("state", "in", ["GA", "NC"]))).toBeNull();
    expect(evaluateCriterion(row, hard("state", "in", ["FL"]))?.reason).toMatch(/not FL/);
    expect(evaluateCriterion(row, hard("state", "not_in", ["GA"]))?.reason).toMatch(/is GA/);
    expect(evaluateCriterion(row, hard("state", "in", []))).toBeNull();
    expect(evaluateCriterion(row, hard("metro", "not_in", ["Savannah"]))).toBeNull();
    const preference = { ...hard("dscr", "gt", 9), role: "PREFERENCE" as const };
    expect(evaluateCriterion(row, preference)).toBeNull();
    const phase = evaluateCriterion(row, hard("lpNetIrr", "gte", 15));
    expect(phase?.reason).toMatch(/Phase 2/);
    expect(phase?.reason).toMatch(/fee needed/);
    expect(evaluateCriterion(fact({ feeNeeded: false }), hard("rcpIrr", "gte", 15))?.reason).toBe("RCP IRR is Phase 2");
    expect(passCount([row, fact({ dscrBps: 10_000 })], [hard("dscr", "gte", 1.25)])).toEqual({ pass: 1, total: 2 });
    expect(evaluateDeal(row, [hard("dscr", "gte", 1.25), preference])).toEqual([]);
    const parsed = parseCriteria([{ field: "dscr", operator: "gte", value: 1.25, role: "HARD_LIMIT", id: "keep" }, { field: "nope" }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.field).toBe("dscr");
  });

  it("round-trips a named preset", async () => {
    const saved = await saveCriteriaPreset(`Library test ${Date.now()}`, [blankCriterion("dscr", "preset-dscr")]);
    presetIds.push(saved.id);
    const loaded = await loadCriteriaPreset(saved.id);
    expect(loaded[0]?.field).toBe("dscr");
    expect(loaded[0]?.operator).toBe("gte");
    expect(loaded[0]?.value).toBe(1.25);
    expect(loaded[0]?.role).toBe("HARD_LIMIT");
  });

  it("keeps the owner column order and can hide or reorder without dropping a column", () => {
    expect(LIBRARY_COLUMNS.map((column) => column.id)).toEqual([
      "dscr",
      "debtYield",
      "capRate",
      "ltv",
      "cashOnCash",
      "lpNetIrr",
      "lpCashYield",
      "rcpIrr",
      "pricePerUnit",
      "occupancy",
      "metro",
      "units",
      "equityRequired",
    ]);
    expect(LIBRARY_COLUMNS.find((column) => column.id === "lpNetIrr")).toMatchObject({ placeholder: "Phase 2" });
    expect(defaultColumnLayout().every((column) => column.visible)).toBe(true);
    const saved = normalizeColumnLayout([
      { id: "metro", visible: true },
      { id: "dscr", visible: false },
      { id: "not-a-column", visible: true },
      { id: "metro", visible: false },
    ]);
    expect(saved[0]).toEqual({ id: "metro", visible: true });
    expect(saved.find((column) => column.id === "dscr")).toEqual({ id: "dscr", visible: false });
    expect(saved.map((column) => column.id)).toEqual([
      "metro",
      "dscr",
      ...LIBRARY_COLUMNS.map((column) => column.id).filter((id) => id !== "metro" && id !== "dscr"),
    ]);
    const moved = moveColumn(defaultColumnLayout(), "occupancy", -1);
    const ids = moved.map((column) => column.id);
    expect(ids.indexOf("occupancy")).toBe(ids.indexOf("pricePerUnit") - 1);
    expect(moveColumn(defaultColumnLayout(), "dscr", -1).map((column) => column.id)).toEqual(
      defaultColumnLayout().map((column) => column.id),
    );
  });

  it("flags analysis age at 90 days amber and 180 days red, and never treats that as a delete", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    expect(analysisStaleLevel(daysAgo(89), now)).toBe("fresh");
    expect(staleFlagLabel("fresh")).toBeNull();
    expect(analysisStaleLevel(daysAgo(90), now)).toBe("amber");
    expect(staleFlagLabel("amber")).toBe("Stale · 90 days");
    expect(analysisStaleLevel(daysAgo(179), now)).toBe("amber");
    expect(analysisStaleLevel(daysAgo(180), now)).toBe("red");
    expect(staleFlagLabel("red")).toBe("Stale · 180 days");
    expect(analysisStaleLevel(null, now)).toBe("missing");
    expect(staleFlagLabel("missing")).toBe("No snapshot");
  });

  it("shows fee needed when a fee is blank and does not invent zero", async () => {
    expect(dealFeeNeededLabel({ amFeeBps: null, otherLpFeeCents: null })).toBe(FEE_NEEDED);
    expect(dealFeeNeededLabel({ amFeeBps: 0, otherLpFeeCents: 0n })).toBeNull();
    expect(opcoFeeNeededLabel(null)).toBe(FEE_NEEDED);
    expect(opcoFeeNeededLabel(0n)).toBeNull();

    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    expect(await loadOpcoGaBudgetCents()).toBeNull();
    await updateOpcoGaBudget({ gaBudgetUsd: "" });
    expect(await loadOpcoGaBudgetCents()).toBeNull();
    await updateOpcoGaBudget({ gaBudgetUsd: 120000 });
    expect(await loadOpcoGaBudgetCents()).toBe(12_000_000n);
    await updateOpcoGaBudget({ gaBudgetUsd: "" });
    expect(await loadOpcoGaBudgetCents()).toBeNull();

    const suffix = Date.now().toString(36).toUpperCase().slice(-5);
    const code = `SPE-F${suffix}`.slice(0, 12);
    const entity = await createEntityWithCoa({
      code,
      name: `Fee ${suffix} LLC`,
      type: "SPE",
      parentId: opco.id,
      dealStatus: "TEST",
    });
    idsToDelete.push(entity.id);
    expect(dealFeeNeededLabel(entity)).toBe(FEE_NEEDED);
    await updateDealLibrary(code, { amFeePercent: "", otherLpFeeUsd: "", city: "" });
    const cleared = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(cleared.amFeeBps).toBeNull();
    expect(cleared.otherLpFeeCents).toBeNull();
    expect(cleared.city).toBeNull();
    await updateDealLibrary(code, { amFeePercent: 1.5, otherLpFeeUsd: 250 });
    const typed = await prisma.entity.findUniqueOrThrow({ where: { id: entity.id } });
    expect(typed.amFeeBps).toBe(150);
    expect(typed.otherLpFeeCents).toBe(25_000n);
    expect(dealFeeNeededLabel(typed)).toBeNull();
  });

  it("seeds states and property types without deleting extras, and starts metros empty of a seed", async () => {
    await ensureLibraryPickLists();
    const states = (await listPickItems(PICK_STATE)).map((row) => row.label);
    for (const label of SEEDED_STATES) expect(states).toContain(label);
    const types = (await listPickItems(PICK_PROPERTY_TYPE)).map((row) => row.label);
    for (const label of SEEDED_PROPERTY_TYPES) expect(types).toContain(label);

    const extra = await addPickItem(PICK_STATE, "zz-keep");
    pickIds.push(extra.id);
    expect(extra.label).toBe("ZZ-KEEP");
    const metro = await addPickItem(PICK_METRO, `Test Metro ${Date.now()}`);
    pickIds.push(metro.id);
    await ensureLibraryPickLists();
    expect(await prisma.libraryPickItem.findUnique({ where: { id: extra.id } })).not.toBeNull();
    expect(await prisma.libraryPickItem.findUnique({ where: { id: metro.id } })).not.toBeNull();
    await expect(removePickItem(extra.id, "nope")).rejects.toThrow(/ZZ-KEEP/);
    expect(await prisma.libraryPickItem.findUnique({ where: { id: extra.id } })).not.toBeNull();
    await removePickItem(extra.id, "zz-keep");
    expect(await prisma.libraryPickItem.findUnique({ where: { id: extra.id } })).toBeNull();
    pickIds.splice(pickIds.indexOf(extra.id), 1);
    expect(await prisma.entity.count({ where: { state: "ZZ-KEEP" } })).toBe(0);
  });
});

describe("Expert Library how-to", () => {
  it("points criteria questions at Library, hard limits, Phase 2, and fee needed", () => {
    const library = listNavTargets().find((row) => row.id === "library");
    expect(library?.href).toBe("/library");
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/How do I find deals that meet my criteria/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/fee needed/);
    expect(EXPERT_SYSTEM_PROMPT).toMatch(/90 days/);
    const ctx = readExpertContext("/library", new URLSearchParams("period=2026-08"));
    const reply = answerOffline("How do I find deals that meet my criteria?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Library/);
    expect(reply.content).toMatch(/Hard limit/);
    expect(reply.content).toMatch(/Phase 2/);
    expect(reply.content).toMatch(/fee needed/);
    expect(reply.content).toMatch(/90 days/);
    expect(reply.content).toMatch(/never deletes/i);
    const chips = rankChips(ctx, emptyBundle, "How do I find deals that meet my criteria?");
    expect(chips.some((chip) => /criteria/i.test(chip.prompt))).toBe(true);
  });
});
