import { applyWaterfallTemplate, buildIncomeStatement, CASH_SHORTFALL_NOTE, dollars, FEE_ACCRUED_UNPAID_NOTE, FEE_EXCEEDS_CASH_NOTE, FEE_UNPAID_AT_EXIT_NOTE, runDealProforma, runWaterfall } from "@rcp/ledger";
import { openPeriod } from "@/lib/deals/periods";
import { createEntityWithCoa } from "@/lib/entities";
import { evaluateCriterion, type LibraryFact } from "@/lib/library/criteria";
import { FEE_NEEDED, GA_BUDGET_NEEDED } from "@/lib/library/fees";
import { loadLibraryRows } from "@/lib/library/facts";
import { membershipDecision, MAX_COMPARE } from "@/lib/models/membership";
import { projectModel, type ModelDealInput } from "@/lib/models/project";
import { toModelView } from "@/lib/models/view";
import {
  addModelDeal,
  compareModelProjections,
  copyModel,
  createModel,
  deleteModel,
  loadModelProjection,
  removeModelDeal,
  updateModelAssumptions,
} from "@/lib/models/store";
import { postJournal } from "@/lib/post-journal";
import { prisma } from "@/lib/prisma";
import { loadPostedLines } from "@/lib/queries";
import { cashFlowsFromDates, solveIrr } from "@/lib/returns/irr";
import { resolveAnnualFee } from "@/lib/returns/fees";
import { EXIT_VALUE_NEEDED, exitValueNeededFor, LOAN_EXCEEDS_EXIT_NOTE, NO_CASH_RETURNED_TO_LP, projectDealReturns, resolveEquityRequiredCents } from "@/lib/returns/project-deal";
import { saveSpeWaterfall } from "@/lib/waterfall";
import { afterAll, describe, expect, it } from "vitest";

/** Periods, checklists, and trailing NOI for one entity. Reads rows that already exist. */
async function entityBooks(entityId: string): Promise<{ periods: number; checks: number; months: number; noi: bigint }> {
  const periods = await prisma.period.findMany({
    where: { entityId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { id: true, year: true, month: true, startDate: true, endDate: true },
  });
  const checks = periods.length
    ? await prisma.closeChecklistItem.count({ where: { periodId: { in: periods.map((period) => period.id) } } })
    : 0;
  let noi = 0n;
  let months = 0;
  for (const period of periods) {
    if (period.year > 2026 || (period.year === 2026 && period.month > 8)) continue;
    months += 1;
    const inPeriod = await loadPostedLines({ entityIds: [entityId], from: period.startDate, to: period.endDate });
    const throughEnd = await loadPostedLines({ entityIds: [entityId], through: period.endDate });
    noi += buildIncomeStatement({ throughEnd, inPeriod }).noi;
  }
  return { periods: periods.length, checks, months, noi };
}

/** Counts write calls on this process's Prisma delegate. Other test files have their own client. */
function watchWrites(delegate: object, methods: string[]) {
  const calls: string[] = [];
  const target = delegate as Record<string, (...args: unknown[]) => unknown>;
  const originals = methods.flatMap((method) => {
    const fn = target[method];
    if (typeof fn !== "function") return [];
    target[method] = (...args: unknown[]) => {
      calls.push(method);
      return fn.apply(delegate, args);
    };
    return [{ method, fn }];
  });
  return {
    calls,
    restore() {
      for (const { method, fn } of originals) target[method] = fn;
    },
  };
}

const ids: string[] = [];
const modelIds: string[] = [];

afterAll(async () => {
  if (modelIds.length) await prisma.portfolioModel.deleteMany({ where: { id: { in: modelIds } } });
  if (ids.length) {
    const children = await prisma.entity.findMany({ where: { parentId: { in: ids } }, select: { id: true } });
    const allIds = [...ids, ...children.map((row) => row.id)];
    // Journal lines reference accounts with no cascade. Drop lines first so a
    // parallel reader never sees a posted line whose account is already gone.
    await prisma.$transaction([
      prisma.journalLine.deleteMany({ where: { journal: { entityId: { in: allIds } } } }),
      prisma.journal.deleteMany({ where: { entityId: { in: allIds } } }),
      prisma.closeChecklistItem.deleteMany({ where: { period: { entityId: { in: allIds } } } }),
      prisma.period.deleteMany({ where: { entityId: { in: allIds } } }),
      prisma.account.deleteMany({ where: { entityId: { in: allIds } } }),
      prisma.entity.deleteMany({ where: { parentId: { in: ids } } }),
      prisma.entity.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }
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
    annualDebtServiceCents: 0n,
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
    expect(noExit.lpIrrNote).toBe(EXIT_VALUE_NEEDED);
    expect(noExit.rcpIrrNote).toBe(EXIT_VALUE_NEEDED);
    expect(noExit.rcpEquityMultipleBps).toBeNull();
    expect(noExit.rcpEquityMultipleNote).toBe(EXIT_VALUE_NEEDED);
    expect(noExit.notes).toContain(EXIT_VALUE_NEEDED);
    expect(noExit.lpYear1CashYieldBps).not.toBeNull();
    expect(noExit.lpAvgCashYieldBps).not.toBeNull();

    const fiveYear = projectDealReturns(baseInput({ holdYears: 5 }));
    expect(fiveYear.lpNetIrrBps).toBeNull();
    expect(fiveYear.lpIrrNote).toBe(EXIT_VALUE_NEEDED);
    expect(fiveYear.lpAvgCashYieldBps).not.toBeNull();

    const short = projectDealReturns(baseInput({ annualDebtServiceCents: dollars(2_000_000) }));
    expect(short.lpYear1CashYieldBps).toBe(0);
    expect(short.years[0]?.lpCents).toBe(0n);
    expect(short.years[0]?.rcpCents).toBe(0n);
    expect(short.notes).toContain(CASH_SHORTFALL_NOTE);

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

    const carried = runDealProforma({
      config: applyWaterfallTemplate("simple_pref_promote"),
      ...CAPITAL,
      holdYears: 2,
      year1CfadsCents: dollars(100),
      cfadsGrowthBps: 10_000,
      exitEquityProceedsCents: 0n,
      operationsDeductionCents: dollars(120),
    });
    expect(carried.notes).toContain(FEE_EXCEEDS_CASH_NOTE);
    expect(carried.years[0]?.operationsCents).toBe(0n);
    expect(carried.years[0]?.feePaidCents).toBe(dollars(100));
    expect(carried.years[1]?.operationsCents).toBe(dollars(60));
    expect(carried.years[1]?.feeAccruedCents).toBe(0n);

    const cleared = projectDealReturns(
      baseInput({
        holdYears: 2,
        year1CfadsCents: dollars(100),
        growthBps: 10_000,
        exitEquityProceedsCents: dollars(1_000),
        amFeeBps: 0,
        otherLpFeeCents: dollars(120),
        purchasePriceCents: dollars(1),
      }),
    );
    expect(cleared.notes).toContain(FEE_EXCEEDS_CASH_NOTE);
    expect(cleared.notes).not.toContain(FEE_ACCRUED_UNPAID_NOTE);
    expect(cleared.notes).not.toContain(FEE_UNPAID_AT_EXIT_NOTE);
    expect(cleared.feeAccruedUnpaidCents).toBe(0n);
    expect(cleared.years[0]?.feePaidCents).toBe(dollars(100));

    const unpaidExit = runDealProforma({
      config: applyWaterfallTemplate("simple_pref_promote"),
      ...CAPITAL,
      holdYears: 1,
      year1CfadsCents: dollars(100),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: dollars(10),
      operationsDeductionCents: dollars(120),
    });
    expect(unpaidExit.years[0]?.distributableCents).toBe(0n);
    expect(unpaidExit.years[0]?.feePaidCents).toBe(dollars(100));
    expect(unpaidExit.years[0]?.feeAccruedCents).toBe(dollars(10));
    expect(unpaidExit.notes).toContain(FEE_UNPAID_AT_EXIT_NOTE);
    expect(unpaidExit.notes).toContain(FEE_ACCRUED_UNPAID_NOTE);

    const salePays = runDealProforma({
      config: applyWaterfallTemplate("simple_pref_promote"),
      ...CAPITAL,
      holdYears: 1,
      year1CfadsCents: dollars(100),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: dollars(50),
      operationsDeductionCents: dollars(120),
    });
    expect(salePays.years[0]?.exitCents).toBe(dollars(30));
    expect(salePays.years[0]?.distributableCents).toBe(dollars(30));
    expect(salePays.years[0]?.feeAccruedCents).toBe(0n);
    expect(salePays.notes).not.toContain(FEE_UNPAID_AT_EXIT_NOTE);
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

    const noExit = projectModel({
      assumptions: { holdYears: 5, growthBps: 0, exitCapRateBps: null, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [dealInput("SPE-S", "SCREENED", true)],
    });
    expect(noExit.lpNetIrrBps).toBeNull();
    expect(noExit.lpIrrNote).toBe(exitValueNeededFor(1));
    expect(noExit.rcpIrrNote).toBe(exitValueNeededFor(1));
    expect(noExit.rcpMultipleNote).toBe(exitValueNeededFor(1));
    expect(noExit.rcpEquityMultipleBps).toBeNull();
    expect(noExit.lpYear1YieldBps).not.toBeNull();
    expect(noExit.cashGap).toBeNull();
    expect(noExit.lpIrrGapDeals).toEqual(["SPE-S"]);

    const mixed = projectModel({
      assumptions: { holdYears: 5, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: 800, opcoPrefCapitalCents: dollars(1_000_000), opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [dealInput("SPE-S", "SCREENED", true), dealInput("SPE-Q", "SCREENED", false)],
    });
    expect(mixed.cashGap).toBe(FEE_NEEDED);
    expect(mixed.feeIncomeCents).toBeNull();
    expect(mixed.years.length).toBeGreaterThan(0);
    expect(mixed.years.every((row) => row.lpCents === null && row.rcpCents === null && row.feeIncomeCents === null)).toBe(true);
    const mixedView = toModelView({
      id: "mixed",
      name: "Mixed",
      kind: "LIVE",
      assumptions: { holdYears: 5, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: 800, opcoPrefCapitalCents: dollars(1_000_000), opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      projection: mixed,
    });
    expect(mixedView.years[0]).toEqual({ year: 1, rcpCents: null, lpCents: null, feeIncomeCents: null });
    expect(mixed.notes.join(" ")).toMatch(/fee needed/);
    expect(mixed.notes.join(" ")).not.toMatch(/blank until both/);

    const stacked = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: null, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [dealInput("SPE-S", "SCREENED", true), dealInput("SPE-A", "ARCHIVED", true)],
    });
    const metro = stacked.concentration.filter((row) => row.dimension === "Metro");
    expect(metro).toHaveLength(1);
    expect(metro[0]?.equityCents).toBe(dollars(11_000_000));

    const limit = evaluateCriterion(
      { ...fact("SPE-S", "SCREENED"), lpNetIrrBps: null, metricGaps: { lpNetIrr: EXIT_VALUE_NEEDED } },
      { id: "irr", field: "lpNetIrr", operator: "gte", value: 15, role: "HARD_LIMIT" },
    );
    expect(limit?.reason).toMatch(/exit value needed/);

    const blankBudget = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: null,
      deals: [dealInput("SPE-S", "SCREENED", true)],
    });
    expect(blankBudget.gaGap).toBe(GA_BUDGET_NEEDED);
    expect(blankBudget.feeIncomeCents).toBe(dollars(100_000));
    expect(blankBudget.cashGap).toBeNull();
  });

  it("treats a missing exit and an underwater loan differently, and blocks a combined IRR when any deal is gapped", () => {
    const unvalued = projectDealReturns(baseInput({ exitCapRateBps: 500, year1NoiCents: 0n, upbCents: dollars(8_000_000) }));
    expect(unvalued.exitGap).toBe(true);
    expect(unvalued.lpNetIrrBps).toBeNull();
    expect(unvalued.lpIrrNote).toBe(EXIT_VALUE_NEEDED);
    expect(unvalued.rcpEquityMultipleNote).toBe(EXIT_VALUE_NEEDED);
    expect(unvalued.notes).not.toContain(LOAN_EXCEEDS_EXIT_NOTE);

    const underwater = projectDealReturns(
      baseInput({
        exitCapRateBps: 500,
        year1NoiCents: dollars(1_200_000),
        upbCents: dollars(30_000_000),
        year1CfadsCents: dollars(12_000_000),
      }),
    );
    expect(underwater.exitGap).toBe(false);
    expect(underwater.exitEquityProceedsCents).toBe(0n);
    expect(underwater.lpNetIrrBps).not.toBeNull();
    expect(underwater.rcpIrrBps).not.toBeNull();
    expect(underwater.rcpEquityMultipleBps).not.toBeNull();
    expect(underwater.lpIrrNote).toBe(LOAN_EXCEEDS_EXIT_NOTE);
    expect(underwater.notes).toContain(LOAN_EXCEEDS_EXIT_NOTE);
    expect(underwater.notes).not.toContain(EXIT_VALUE_NEEDED);
    expect(underwater.lpYear1CashYieldBps).not.toBeNull();

    const valued = dealInput("SPE-OK", "SCREENED", true);
    const gapped = dealInput("SPE-GAP", "SCREENED", true);
    gapped.annualizedNoiCents = 0n;
    const combined = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [valued, gapped],
    });
    expect(combined.lpNetIrrBps).toBeNull();
    expect(combined.rcpIrrBps).toBeNull();
    expect(combined.rcpEquityMultipleBps).toBeNull();
    expect(combined.lpIrrNote).toBe(exitValueNeededFor(1));
    expect(combined.rcpIrrNote).toBe(exitValueNeededFor(1));
    expect(combined.rcpMultipleNote).toBe(exitValueNeededFor(1));
    expect(combined.lpIrrGapDeals).toEqual(["SPE-GAP"]);
    expect(combined.lpIrrMinBps).not.toBeNull();
    expect(combined.lpIrrMaxBps).toBe(combined.lpIrrMinBps);
    expect(combined.deals.find((deal) => deal.code === "SPE-OK")?.metrics?.lpNetIrrBps).not.toBeNull();
    expect(combined.deals.find((deal) => deal.code === "SPE-GAP")?.metrics?.lpIrrNote).toBe(EXIT_VALUE_NEEDED);

    const noEquity = dealInput("SPE-NIL", "SCREENED", true);
    noEquity.annualizedNoiCents = 0n;
    noEquity.returns = { ...noEquity.returns, lpContributedCents: 0n, unreturnedCapitalCents: 0n };
    const counted = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: null, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [dealInput("SPE-S", "SCREENED", true), noEquity],
    });
    expect(counted.lpIrrNote).toBe(exitValueNeededFor(1));
    expect(counted.lpIrrGapDeals).toEqual(["SPE-S"]);
    expect(counted.noLpEquityDeals).toEqual(["SPE-NIL"]);
    expect(counted.notes.join(" ")).toContain("no LP equity: SPE-NIL");
  });

  it("values the exit from NOI, not CFADS, and grows that NOI", () => {
    const quiet = projectDealReturns(
      baseInput({
        exitCapRateBps: 500,
        year1NoiCents: dollars(100_000),
        year1CfadsCents: dollars(5_000_000),
        upbCents: 0n,
        holdYears: 1,
        growthBps: 0,
      }),
    );
    expect(quiet.exitGap).toBe(false);
    expect(quiet.exitEquityProceedsCents).toBe(dollars(2_000_000));

    const grown = projectDealReturns(
      baseInput({
        exitCapRateBps: 500,
        year1NoiCents: dollars(100_000),
        year1CfadsCents: dollars(5_000_000),
        upbCents: 0n,
        holdYears: 2,
        growthBps: 10_000,
      }),
    );
    expect(grown.exitEquityProceedsCents).toBe(dollars(4_000_000));
    expect(grown.lpIrrNote).not.toBe(EXIT_VALUE_NEEDED);
  });

  it("shows -100% when the LP receives no cash, and keeps that deal in the range", () => {
    const dry = projectDealReturns(
      baseInput({
        exitCapRateBps: 500,
        year1NoiCents: dollars(1_200_000),
        upbCents: dollars(30_000_000),
        year1CfadsCents: 0n,
      }),
    );
    expect(dry.exitGap).toBe(false);
    expect(dry.lpNetIrrBps).toBe(-10_000);
    expect(dry.lpIrrNote).toBe(NO_CASH_RETURNED_TO_LP);
    expect(dry.notes).not.toContain("IRR not available");

    const row = dealInput("SPE-DRY", "SCREENED", true);
    row.upbCents = dollars(30_000_000);
    row.returns = { ...row.returns, year1CfadsCents: 0n };
    const model = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [row],
    });
    expect(model.lpNetIrrBps).toBe(-10_000);
    expect(model.lpIrrNote).toBe(NO_CASH_RETURNED_TO_LP);
    expect(model.lpIrrMinBps).toBe(-10_000);
    expect(model.lpIrrMaxBps).toBe(-10_000);
    const view = toModelView({
      id: "dry",
      name: "Dry",
      kind: "LIVE",
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: 500, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      projection: model,
    });
    expect(view.lpIrrMinBps).toBe(-10_000);
    expect(view.deals[0]?.lpIrrNote).toBe(NO_CASH_RETURNED_TO_LP);
  });

  it("counts fee income from cash after debt service and keeps unpaid fees out of that total", () => {
    const payable = dealInput("SPE-PAY", "SCREENED", true);
    payable.returns = { ...payable.returns, year1CfadsCents: dollars(100_000) };
    const shortB = dealInput("SPE-B", "SCREENED", true);
    shortB.returns = { ...shortB.returns, year1CfadsCents: 0n };
    const shortC = dealInput("SPE-C", "SCREENED", true);
    shortC.returns = { ...shortC.returns, year1CfadsCents: 0n };
    const model = projectModel({
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: null, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      gaBudgetCents: dollars(50_000),
      deals: [payable, shortB, shortC],
    });
    expect(model.feeIncomeCents).toBe(dollars(100_000));
    expect(model.years[0]?.feeIncomeCents).toBe(dollars(100_000));
    expect(model.feeAccruedUnpaidCents).toBe(dollars(200_000));
    expect(model.gaCoverageBps).toBe(20_000);
    expect(model.notes.join(" ")).toContain(FEE_ACCRUED_UNPAID_NOTE);
    expect(model.notes.join(" ")).toContain(FEE_UNPAID_AT_EXIT_NOTE);
    expect(model.notes.join(" ")).toContain(FEE_EXCEEDS_CASH_NOTE);
    const view = toModelView({
      id: "fees",
      name: "Fees",
      kind: "LIVE",
      assumptions: { holdYears: 1, growthBps: 0, exitCapRateBps: null, opcoPrefRateBps: null, opcoPrefCapitalCents: null, opcoLpSplitBps: 8000, opcoGpSplitBps: 2000 },
      criteria: [],
      projection: model,
    });
    expect(view.deals.find((deal) => deal.code === "SPE-B")?.notes).toContain(FEE_ACCRUED_UNPAID_NOTE);
    expect(view.deals.find((deal) => deal.code === "SPE-B")?.feeAccruedUnpaidCents).toBe(Number(dollars(100_000)));
    expect(view.deals.find((deal) => deal.code === "SPE-PAY")?.notes).not.toContain(FEE_ACCRUED_UNPAID_NOTE);
  });
});

describe("Models do not move the OpCo roll-up", () => {
  it("creates, copies, adds, removes, and compares without touching books", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
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

    const demosAfter = await prisma.entity.findMany({
      where: { code: { in: ["SPE-WBG", "SPE-CVC", "SPE-HCR"] } },
      select: { code: true, dealStatus: true, updatedAt: true },
    });
    expect(demosAfter).toEqual(demosBefore);
  }, 60_000);

  it("reads the library and a model without writing this deal's periods, checklists, or T12", async () => {
    const hold = await prisma.entity.findUnique({ where: { code: "RCP-HOLD" } });
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const shelf = await createEntityWithCoa({
      code: `ZSH${suffix}`,
      name: `Shelf ${suffix}`,
      type: "OPCO",
      parentId: hold?.id,
      dealStatus: "OWNED",
    });
    const owned = await createEntityWithCoa({
      code: `SPE-O${suffix}`,
      name: `Owned ${suffix}`,
      type: "SPE",
      parentId: shelf.id,
      dealStatus: "OWNED",
    });
    ids.push(shelf.id, owned.id);
    const period = await openPeriod(owned.id, 2026, 8);
    await postJournal({
      entityId: owned.id,
      periodId: period.id,
      date: period.startDate,
      memo: "Owned rent for the library read test",
      lines: [
        { accountCode: "1010", debit: dollars(50_000), credit: 0n },
        { accountCode: "4010", debit: 0n, credit: dollars(50_000) },
      ],
    });
    const before = await entityBooks(owned.id);
    expect(before.periods).toBeGreaterThan(0);
    expect(before.checks).toBeGreaterThan(0);
    expect(before.months).toBe(before.periods);
    expect(before.noi).toBe(dollars(50_000));

    const periodWrites = watchWrites(prisma.period, ["create", "createMany", "upsert", "update", "updateMany", "delete", "deleteMany"]);
    const checklistWrites = watchWrites(prisma.closeChecklistItem, ["create", "createMany", "upsert", "update", "updateMany"]);
    const journalWrites = watchWrites(prisma.journal, ["create", "createMany"]);
    const live = await createModel({ name: `Read ${suffix}`, kind: "LIVE" });
    modelIds.push(live.id);
    try {
      await loadLibraryRows();
      await addModelDeal(live.id, owned.code);
      await loadModelProjection(live.id);
      await updateModelAssumptions(live.id, { holdYears: 4, growthPercent: 1, exitCapPercent: "", opcoPrefPercent: "", opcoPrefCapitalUsd: "" });
      await loadModelProjection(live.id, 2030, 1);
      await deleteModel(live.id);
      modelIds.splice(modelIds.indexOf(live.id), 1);
      await loadLibraryRows();
      expect(periodWrites.calls, "Period writes").toEqual([]);
      expect(checklistWrites.calls, "checklist writes").toEqual([]);
      expect(journalWrites.calls, "journal writes").toEqual([]);
    } finally {
      periodWrites.restore();
      checklistWrites.restore();
      journalWrites.restore();
    }
    expect(await entityBooks(owned.id)).toEqual(before);
  }, 60_000);

  it("values an Owned deal with no snapshot from book NOI, not from CFADS", async () => {
    const hold = await prisma.entity.findUnique({ where: { code: "RCP-HOLD" } });
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const shelf = await createEntityWithCoa({
      code: `ZSH${suffix}B`,
      name: `Book shelf ${suffix}`,
      type: "OPCO",
      parentId: hold?.id,
      dealStatus: "OWNED",
    });
    const owned = await createEntityWithCoa({
      code: `SPE-N${suffix}`,
      name: `Book NOI ${suffix}`,
      type: "SPE",
      parentId: shelf.id,
      dealStatus: "OWNED",
    });
    ids.push(shelf.id, owned.id);
    await prisma.entity.update({
      where: { id: owned.id },
      data: { amFeeBps: 0, otherLpFeeCents: 0n },
    });
    const period = await openPeriod(owned.id, 2026, 8);
    const monthlyNoi = dollars(10_000);
    const monthlyCapex = dollars(4_000);
    await postJournal({
      entityId: owned.id,
      periodId: period.id,
      date: period.startDate,
      memo: "Rent for the book NOI exit",
      lines: [
        { accountCode: "1010", debit: monthlyNoi, credit: 0n },
        { accountCode: "4010", debit: 0n, credit: monthlyNoi },
      ],
    });
    await postJournal({
      entityId: owned.id,
      periodId: period.id,
      date: period.startDate,
      memo: "Capex that lowers CFADS and leaves NOI alone",
      lines: [
        { accountCode: "1430", debit: monthlyCapex, credit: 0n },
        { accountCode: "1010", debit: 0n, credit: monthlyCapex },
      ],
    });
    const lp = dollars(1_000_000);
    await saveSpeWaterfall(owned.id, {
      ...applyWaterfallTemplate("simple_pref_promote"),
      gpCoInvestBps: 1_000,
      lpContributedCents: lp,
      unreturnedCapitalCents: lp,
      unpaidPrefCents: 0n,
      prefPaidToDateCents: 0n,
    });
    expect(await prisma.dealAnalysisSnapshot.count({ where: { entityId: owned.id } })).toBe(0);

    const annualNoi = monthlyNoi * 12n;
    const annualCfads = (monthlyNoi - monthlyCapex) * 12n;
    const capBps = 500;
    const fromNoi = (annualNoi * 10_000n) / BigInt(capBps);
    const fromCfads = (annualCfads * 10_000n) / BigInt(capBps);
    expect(fromNoi).toBe(dollars(2_400_000));
    expect(fromCfads).not.toBe(fromNoi);

    const model = await createModel({ name: `Book NOI ${suffix}`, kind: "LIVE" });
    modelIds.push(model.id);
    await addModelDeal(model.id, owned.code);
    await updateModelAssumptions(model.id, {
      holdYears: 1,
      growthPercent: 0,
      exitCapPercent: 5,
      opcoPrefPercent: "",
      opcoPrefCapitalUsd: "",
    });
    const loaded = await loadModelProjection(model.id, 2026, 8);
    const deal = loaded.projection.deals.find((row) => row.code === owned.code);
    expect(deal?.metrics?.exitGap).toBe(false);
    expect(deal?.metrics?.exitEquityProceedsCents).toBe(fromNoi);
    expect(deal?.metrics?.exitEquityProceedsCents).not.toBe(fromCfads);
    expect(deal?.metrics?.lpIrrNote).not.toBe(EXIT_VALUE_NEEDED);
    expect(loaded.projection.lpIrrNote).not.toBe(EXIT_VALUE_NEEDED);
  }, 60_000);

  it("shows library equity from the same helper Models use", async () => {
    const opco = await prisma.entity.findUnique({ where: { code: "RCP-OPCO" } });
    if (!opco) throw new Error("Seed RCP-OPCO before running this test (npm run db:reset)");
    const suffix = Date.now().toString(36).toUpperCase().slice(-4);
    const entity = await createEntityWithCoa({
      code: `SPE-E${suffix}`,
      name: `Equity ${suffix}`,
      type: "SPE",
      parentId: opco.id,
      dealStatus: "PIPELINE",
    });
    ids.push(entity.id);
    const lp = dollars(9_000_000);
    await saveSpeWaterfall(entity.id, {
      ...applyWaterfallTemplate("simple_pref_promote"),
      gpCoInvestBps: 1_000,
      lpContributedCents: lp,
      unreturnedCapitalCents: lp,
      unpaidPrefCents: 0n,
      prefPaidToDateCents: 0n,
    });
    const expected = resolveEquityRequiredCents({ lpContributedCents: lp, gpCoInvestBps: 1_000, snapshotCents: null });
    const row = (await loadLibraryRows()).find((item) => item.code === entity.code);
    expect(expected).toBe(dollars(10_000_000));
    expect(row?.equityRequiredCents).toBe(Number(expected));
  });
});
