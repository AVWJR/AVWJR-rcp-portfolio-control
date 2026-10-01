import { applyWaterfallTemplate, dollars, runDealProforma, runWaterfall } from "@rcp/ledger";
import { buildOpCoDashboard } from "@/lib/dashboards";
import { createEntityWithCoa } from "@/lib/entities";
import { FEE_NEEDED } from "@/lib/library/fees";
import { membershipDecision, MAX_COMPARE } from "@/lib/models/membership";
import { projectModel, type ModelDealInput } from "@/lib/models/project";
import {
  addModelDeal,
  compareModelProjections,
  copyModel,
  createModel,
  deleteModel,
  removeModelDeal,
  updateModelAssumptions,
} from "@/lib/models/store";
import { prisma } from "@/lib/prisma";
import { cashFlowsFromDates, IRR_NOT_AVAILABLE, solveIrr } from "@/lib/returns/irr";
import { resolveAnnualFee } from "@/lib/returns/fees";
import { projectDealReturns } from "@/lib/returns/project-deal";
import type { LibraryFact } from "@/lib/library/criteria";
import { afterAll, describe, expect, it } from "vitest";

const ids: string[] = [];
const modelIds: string[] = [];

afterAll(async () => {
  if (modelIds.length) await prisma.portfolioModel.deleteMany({ where: { id: { in: modelIds } } });
  if (ids.length) await prisma.entity.deleteMany({ where: { id: { in: ids } } });
});

const CAPITAL = {
  lpContributedCents: dollars(10_000_000),
  unreturnedCapitalCents: dollars(10_000_000),
  unpaidPrefCents: 0n,
  prefPaidToDateCents: 0n,
};

function baseInput(over: Partial<Parameters<typeof projectDealReturns>[0]> = {}) {
  return {
    config: { ...applyWaterfallTemplate("simple_pref_promote"), gpCoInvestBps: 1_000 },
    ...CAPITAL,
    year1CfadsCents: dollars(1_200_000),
    holdYears: 1,
    growthBps: 0,
    exitEquityProceedsCents: 0n,
    amFeeBps: 100,
    otherLpFeeCents: 0n,
    purchasePriceCents: dollars(10_000_000),
    equityRequiredCents: null,
    ...over,
  };
}

describe("IRR", () => {
  it("solves a standard one-year 10% case", () => {
    const solved = solveIrr([
      { amount: -100, tYears: 0 },
      { amount: 110, tYears: 1 },
    ]);
    expect(solved.reason).toBeNull();
    expect(solved.rate).toBeCloseTo(0.1, 6);
  });

  it("returns a reason when the cash flows do not change sign", () => {
    const solved = solveIrr([
      { amount: 100, tYears: 0 },
      { amount: 50, tYears: 1 },
    ]);
    expect(solved.rate).toBeNull();
    expect(solved.reason).toBe("No sign change in the cash flows");
    expect(Number.isNaN(solved.rate as number)).toBe(false);
  });

  it("handles a zero-cash year and irregular dates", () => {
    const zeroYear = solveIrr([
      { amount: -100, tYears: 0 },
      { amount: 0, tYears: 1 },
      { amount: 121, tYears: 2 },
    ]);
    expect(zeroYear.rate).toBeCloseTo(0.1, 5);

    const dated = cashFlowsFromDates([
      { amount: -100, date: new Date("2026-01-01T00:00:00Z") },
      { amount: 105, date: new Date("2026-07-02T00:00:00Z") },
    ]);
    expect(dated[1]?.tYears).toBeGreaterThan(0.4);
    expect(dated[1]?.tYears).toBeLessThan(0.6);
    const irregular = solveIrr([
      { amount: -100, tYears: 0 },
      { amount: 105, tYears: 0.5 },
    ]);
    expect(irregular.rate).toBeCloseTo(0.1025, 3);
  });

  it("picks one root when the cash flows change sign more than once", () => {
    const first = solveIrr([
      { amount: -100, tYears: 0 },
      { amount: 230, tYears: 1 },
      { amount: -132, tYears: 2 },
    ]);
    const second = solveIrr([
      { amount: -100, tYears: 0 },
      { amount: 230, tYears: 1 },
      { amount: -132, tYears: 2 },
    ]);
    expect(first.rate).not.toBeNull();
    expect(first.rate).toBeCloseTo(0.1, 4);
    expect(second.rate).toBe(first.rate);
  });
});

describe("LP cash yield and fees", () => {
  it("splits exit-year operating cash and keeps sale proceeds in IRR only", () => {
    const config = applyWaterfallTemplate("simple_pref_promote");
    const withExit = runDealProforma({
      config,
      ...CAPITAL,
      holdYears: 2,
      year1CfadsCents: dollars(1_200_000),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: dollars(5_000_000),
    });
    const opsOnly = runDealProforma({
      config,
      ...CAPITAL,
      holdYears: 2,
      year1CfadsCents: dollars(1_200_000),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: 0n,
    });
    const exitYear = withExit.years[1]!;
    expect(exitYear.lpOperatingCents).toBe(opsOnly.years[1]!.lpCents);
    expect(exitYear.lpCents).toBeGreaterThan(exitYear.lpOperatingCents);
    expect(withExit.years[0]!.lpOperatingCents).toBe(withExit.years[0]!.lpCents);

    const metrics = projectDealReturns(
      baseInput({
        config,
        holdYears: 2,
        exitEquityProceedsCents: dollars(5_000_000),
        amFeeBps: 0,
        otherLpFeeCents: 0n,
      }),
    );
    expect(metrics.gap).toBeNull();
    const operating = metrics.years.reduce((sum, row) => sum + row.lpOperatingCents, 0n);
    const distributed = metrics.years.reduce((sum, row) => sum + row.lpCents, 0n);
    expect(distributed).toBeGreaterThan(operating);
    expect(metrics.lpAvgCashYieldBps).toBe(Number((operating / 2n) * 10_000n / CAPITAL.lpContributedCents));
    expect(metrics.lpYear1CashYieldBps).toBe(Number((metrics.years[0]!.lpOperatingCents * 10_000n) / CAPITAL.lpContributedCents));
    expect(metrics.lpNetIrrBps).not.toBeNull();
  });

  it("shows fee needed until the fee is typed, then deducts it before the waterfall", () => {
    expect(resolveAnnualFee({ amFeeBps: null, otherLpFeeCents: 0n, purchasePriceCents: dollars(1) }).ok).toBe(false);
    const missing = projectDealReturns(baseInput({ amFeeBps: null }));
    expect(missing.gap).toBe(FEE_NEEDED);
    expect(missing.lpNetIrrBps).toBeNull();
    expect(missing.lpAvgCashYieldBps).toBeNull();
    expect(missing.rcpIrrBps).toBeNull();

    const noExit = projectDealReturns(baseInput());
    expect(noExit.gap).toBeNull();
    expect(noExit.feeAnnualCents).toBe(dollars(100_000));
    expect(noExit.lpNetIrrBps).toBeNull();
    expect(noExit.lpIrrNote).toBe(IRR_NOT_AVAILABLE);
    expect(noExit.rcpIrrNote).toBe(IRR_NOT_AVAILABLE);
    expect(noExit.notes).toContain(IRR_NOT_AVAILABLE);
    expect(noExit.notes.some((note) => note.includes("No IRR in range"))).toBe(false);
    expect(noExit.lpYear1CashYieldBps).not.toBeNull();
    expect(noExit.lpAvgCashYieldBps).not.toBeNull();

    const priced = projectDealReturns(baseInput({ exitEquityProceedsCents: dollars(15_000_000) }));
    expect(priced.gap).toBeNull();
    expect(priced.lpNetIrrBps).not.toBeNull();
    expect(priced.lpIrrNote).toBeNull();

    const gross = runWaterfall({
      config: applyWaterfallTemplate("simple_pref_promote"),
      ...CAPITAL,
      distributableCents: dollars(12_000_000),
      periodMonths: 12,
    });
    const net = runDealProforma({
      config: applyWaterfallTemplate("simple_pref_promote"),
      ...CAPITAL,
      holdYears: 1,
      year1CfadsCents: dollars(12_000_000),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: 0n,
      operationsDeductionCents: dollars(100_000),
    });
    const direct = runWaterfall({
      config: applyWaterfallTemplate("simple_pref_promote"),
      ...CAPITAL,
      distributableCents: dollars(11_900_000),
      periodMonths: 12,
    });
    expect(net.years[0]?.distributableCents).toBe(dollars(11_900_000));
    expect(net.years[0]?.lpCents).toBe(direct.lpCents);
    expect(net.years[0]?.lpCents).not.toBe(gross.lpCents);
  });
});

function fact(code: string, status: string): LibraryFact {
  return {
    code,
    dscrBps: 12_500,
    debtYieldBps: 900,
    capRateBps: 550,
    ltvBps: 6_000,
    cashOnCashBps: 700,
    occupancyBps: 9_400,
    expenseRatioBps: 4_000,
    pricePerUnitCents: 15_000_000,
    unitCount: 120,
    lpNetIrrBps: null,
    lpCashYieldBps: null,
    rcpIrrBps: null,
    state: status === "PIPELINE" ? "NY" : "GA",
    metro: "Atlanta",
    msa: null,
    submarket: null,
    city: null,
    propertyType: "Garden",
    assetClass: "B",
    vintageYear: 2001,
    businessPlan: "Value-add",
    prefRateBps: 800,
    catchUpBps: null,
    coGpBps: 0,
    equityRequiredCents: Number(dollars(11_000_000)),
    dealStatus: status,
    feeNeeded: status === "PIPELINE",
  };
}

function dealInput(code: string, status: string, fees: boolean): ModelDealInput {
  return {
    code,
    name: code,
    dealStatus: status,
    optimizerEligible: status === "SCREENED" || status === "OWNED",
    flag: status === "PIPELINE" ? "not yet screened" : null,
    stale: "fresh",
    metro: "Atlanta",
    state: status === "PIPELINE" ? "NY" : "GA",
    propertyType: "Garden",
    vintageYear: 2001,
    equityRequiredCents: dollars(11_000_000),
    dscrBps: 12_500,
    debtYieldBps: 900,
    annualizedNoiCents: dollars(1_200_000),
    upbCents: dollars(8_000_000),
    fact: fact(code, status),
    returns: {
      ...baseInput({ amFeeBps: fees ? 100 : null, otherLpFeeCents: fees ? 0n : null }),
      equityRequiredCents: dollars(11_000_000),
    },
  };
}

describe("Model membership and projection", () => {
  it("flags Pipeline, accepts Screened, and refuses Archived and Test in the wrong Model", () => {
    expect(membershipDecision("PIPELINE", "LIVE")).toEqual({ ok: true, optimizerEligible: false, flag: "not yet screened" });
    expect(membershipDecision("SCREENED", "LIVE")).toMatchObject({ ok: true, optimizerEligible: true, flag: null });
    expect(membershipDecision("OWNED", "LIVE")).toMatchObject({ ok: true, optimizerEligible: true });
    expect(membershipDecision("ARCHIVED", "LIVE").ok).toBe(false);
    expect(membershipDecision("TEST", "LIVE").ok).toBe(false);
    expect(membershipDecision("TEST", "TEST")).toMatchObject({ ok: true, optimizerEligible: false });
    expect(membershipDecision("SCREENED", "TEST").ok).toBe(false);

    const blocked = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: null, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: null,
      deals: [dealInput("SPE-P", "PIPELINE", false)],
    });
    expect(blocked.deals[0]?.flag).toBe("not yet screened");
    expect(blocked.deals[0]?.optimizerEligible).toBe(false);
    expect(blocked.lpGap).toBe(FEE_NEEDED);
    expect(blocked.lpNetIrrBps).toBeNull();
    expect(blocked.gaGap).toBe(FEE_NEEDED);

    const ready = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [dealInput("SPE-S", "SCREENED", true)],
    });
    expect(ready.deals[0]?.optimizerEligible).toBe(true);
    expect(ready.lpGap).toBeNull();
    expect(ready.lpNetIrrBps).not.toBeNull();
    expect(ready.gaCoverageBps).not.toBeNull();
    expect(ready.label).toBe("Projection, not books.");
  });
});

describe("Models do not move the OpCo roll-up", () => {
  it("creates, copies, adds, removes, and compares without touching books", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const before = await rollupFingerprint(opco.id);
    const demosBefore = await prisma.entity.findMany({
      where: { code: { in: ["SPE-WBG", "SPE-CVC", "SPE-HCR"] } },
      select: { code: true, dealStatus: true, updatedAt: true },
    });

    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const pipeline = await createEntityWithCoa({ code: `SPE-P${suffix}`, name: `Pipe ${suffix}`, type: "SPE", parentId: opco.id, dealStatus: "PIPELINE" });
    const screened = await createEntityWithCoa({ code: `SPE-S${suffix}`, name: `Screen ${suffix}`, type: "SPE", parentId: opco.id, dealStatus: "SCREENED" });
    const archived = await createEntityWithCoa({ code: `SPE-A${suffix}`, name: `Arch ${suffix}`, type: "SPE", parentId: opco.id, dealStatus: "PIPELINE" });
    const testDeal = await createEntityWithCoa({ code: `SPE-T${suffix}`, name: `Test ${suffix}`, type: "SPE", parentId: opco.id, dealStatus: "TEST" });
    ids.push(pipeline.id, screened.id, archived.id, testDeal.id);
    await prisma.entity.update({ where: { id: archived.id }, data: { dealStatus: "ARCHIVED" } });

    const live = await createModel({ name: `Model A ${suffix}`, kind: "LIVE" });
    modelIds.push(live.id);
    const added = await addModelDeal(live.id, pipeline.code);
    expect(added.flag).toBe("not yet screened");
    expect(added.optimizerEligible).toBe(false);
    const screenedRow = await addModelDeal(live.id, screened.code);
    expect(screenedRow.optimizerEligible).toBe(true);
    await expect(addModelDeal(live.id, archived.code)).rejects.toThrow(/view only/i);
    await expect(addModelDeal(live.id, testDeal.code)).rejects.toThrow(/Test Model/i);

    const testModel = await createModel({ name: `Test Model ${suffix}`, kind: "TEST" });
    modelIds.push(testModel.id);
    await addModelDeal(testModel.id, testDeal.code);
    await expect(addModelDeal(testModel.id, screened.code)).rejects.toThrow(/only holds Test/i);

    const copy = await copyModel(live.id);
    modelIds.push(copy.id);
    expect(copy.id).not.toBe(live.id);
    const copyDeals = await prisma.portfolioModelDeal.count({ where: { modelId: copy.id } });
    expect(copyDeals).toBe(2);
    await removeModelDeal(copy.id, pipeline.code);
    expect(await prisma.portfolioModelDeal.count({ where: { modelId: live.id } })).toBe(2);
    expect((await prisma.entity.findUnique({ where: { id: pipeline.id } }))?.dealStatus).toBe("PIPELINE");

    await updateModelAssumptions(live.id, { holdYears: 6, growthPercent: 2, exitCapPercent: "", opcoPrefPercent: "", opcoPrefCapitalUsd: "" });
    const saved = await prisma.portfolioModel.findUniqueOrThrow({ where: { id: live.id } });
    expect(saved.holdYears).toBe(6);
    expect(saved.exitCapRateBps).toBeNull();

    const extraA = await createModel({ name: `Extra A ${suffix}` });
    const extraB = await createModel({ name: `Extra B ${suffix}` });
    modelIds.push(extraA.id, extraB.id);
    const compared = await compareModelProjections([live.id, copy.id, extraA.id, extraB.id], 2026, 8);
    expect(compared).toHaveLength(4);
    expect(MAX_COMPARE).toBe(4);
    await expect(compareModelProjections([live.id, copy.id, extraA.id, extraB.id, testModel.id], 2026, 8)).rejects.toThrow(/4/);

    await deleteModel(copy.id);
    modelIds.splice(modelIds.indexOf(copy.id), 1);
    expect(await prisma.portfolioModel.findUnique({ where: { id: live.id } })).not.toBeNull();
    expect(await prisma.journal.count({ where: { entityId: { in: ids } } })).toBe(0);
    expect(await prisma.distributionEvent.count({ where: { entityId: { in: ids } } })).toBe(0);

    const after = await rollupFingerprint(opco.id);
    expect(after).toEqual(before);
    const demosAfter = await prisma.entity.findMany({
      where: { code: { in: ["SPE-WBG", "SPE-CVC", "SPE-HCR"] } },
      select: { code: true, dealStatus: true, updatedAt: true },
    });
    expect(demosAfter).toEqual(demosBefore);
  }, 60_000);
});

async function rollupFingerprint(opcoId: string) {
  const demos = await prisma.entity.findMany({
    where: { code: { in: ["SPE-WBG", "SPE-CVC", "SPE-HCR", "RCP-OPCO"] } },
    select: { id: true },
  });
  const entityIds = demos.map((row) => row.id);
  const dash = await buildOpCoDashboard({ opcoId, year: 2026, month: 8 });
  const demoCodes = new Set(["SPE-WBG", "SPE-CVC", "SPE-HCR"]);
  const lines = await prisma.journalLine.aggregate({
    where: { journal: { entityId: { in: entityIds } } },
    _sum: { debit: true, credit: true },
    _count: true,
  });
  return {
    journals: await prisma.journal.count({ where: { entityId: { in: entityIds } } }),
    lines: lines._count,
    debits: (lines._sum.debit ?? 0n).toString(),
    credits: (lines._sum.credit ?? 0n).toString(),
    distributions: await prisma.distributionEvent.count({ where: { entityId: { in: entityIds } } }),
    properties: dash.properties
      .filter((row) => demoCodes.has(row.entityCode))
      .map((row) => ({
        code: row.entityCode,
        noi: row.noiCents.toString(),
        cfadsRcp: row.cfadsRcpCents.toString(),
        cfadsLp: row.cfadsLpCents.toString(),
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}
