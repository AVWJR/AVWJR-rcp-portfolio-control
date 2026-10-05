import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describePlan, floorPlanRows, type PlanFacts, type PlanUnit } from "@/lib/asset-mgmt/analyze";
import {
  centsPerCount,
  dollarsAtStake,
  noiMarginBps,
  NOT_AVAILABLE,
  observationIsStale,
  paybackMonths,
  peerGapPerUnit,
  presentBps,
  presentCents,
  rankByMarginImpact,
  revpauCents,
  utilityRecoveryBps,
  lostRentPerDayCents,
  whatChanged,
  type ScoreSnapshot,
} from "@/lib/asset-mgmt/formulas";
import {
  PLAN_BLOCKED_SOURCE,
  PLAN_DATE,
  PLAN_FUTURE,
  PLAN_PERIOD_RANGE,
  PLAN_RESIDENT,
  PLAN_RETRIEVED_ORDER,
  PLAN_VIEWER,
  PLAN_ZORI_CREDIT,
  assertPlanPeriod,
  assertCanMutatePlan,
  assertNoResidentKeys,
  decisionSideEffects,
  excludeSelf,
  publicLeaseDates,
  recommendedBand,
  validateWeeklyUpdate,
  AssetPlanError,
} from "@/lib/asset-mgmt/policy";
import { isPostgresUrl } from "@/lib/db-provider";

function facts(partial: Partial<PlanFacts> = {}): PlanFacts {
  return {
    entityCode: "SPE-WBG",
    periodLabel: "2026-08",
    periodEnd: "2026-08-31",
    booksActive: false,
    egiCents: null,
    noiCents: null,
    otherIncomeCents: null,
    payrollCents: null,
    pmFeeCents: null,
    controllableOpexCents: null,
    controllableBudgetCents: null,
    makeReadyCents: null,
    badDebtCents: null,
    arControlCents: null,
    reserveCashCents: null,
    rubsCents: null,
    utilityCents: null,
    otherIncomeLines: null,
    utilityLines: null,
    dealUnitCount: null,
    rentRollAsOf: "2026-08-16",
    units: null,
    peers: [],
    opportunities: [],
    observations: [],
    loan: null,
    underwriting: null,
    businessPlanNote: null,
    ...partial,
  };
}

function unit(partial: Partial<PlanUnit> & Pick<PlanUnit, "unitCode" | "status">): PlanUnit {
  return {
    floorplan: "A1",
    marketRent: 100_000n,
    inPlaceRent: partial.status === "OCCUPIED" ? 100_000n : 0n,
    concessionCents: 0n,
    leaseStart: null,
    leaseEnd: null,
    moveIn: null,
    moveOut: null,
    readyDate: null,
    ...partial,
  };
}

describe("asset plan formulas", () => {
  it("uses truncating cents and blank zero denominators", () => {
    expect(revpauCents(100n, 3)).toBe(33n);
    expect(revpauCents(100n, 0)).toBeNull();
    expect(revpauCents(null, 3)).toBeNull();
    expect(centsPerCount(1_000n, 3)).toBe(333n);
    expect(centsPerCount(0n, 0)).toBeNull();
    expect(noiMarginBps(1n, 3n)).toBe(3333);
    expect(noiMarginBps(0n, 100n)).toBe(0);
    expect(noiMarginBps(100n, 0n)).toBeNull();
    expect(noiMarginBps(null, 100n)).toBeNull();
    expect(utilityRecoveryBps(100n, 400n)).toBe(2500);
    expect(utilityRecoveryBps(100n, 0n)).toBeNull();
    expect(utilityRecoveryBps(null, 400n)).toBeNull();
    expect(presentCents(null)).toBe(NOT_AVAILABLE);
    expect(presentCents(0n)).toBe("$0.00");
    expect(lostRentPerDayCents(0n)).toBeNull();
    expect(lostRentPerDayCents(30_000n)).toBe(1_000n);
  });

  it("ranks by margin dollars and RevPAU, not by an occupancy rate", () => {
    const ranked = rankByMarginImpact([
      { code: "OCCUPANCY", impactCents: 100n, revpauDeltaCents: 9_999n, occupancyGapBps: 9_000 },
      { code: "RENT", impactCents: 500n, revpauDeltaCents: 1n, occupancyGapBps: 0 },
      { code: "MISSING", impactCents: null, revpauDeltaCents: 9_999_999n, occupancyGapBps: 10_000 },
    ]);
    expect(ranked.map((row) => row.code)).toEqual(["RENT", "OCCUPANCY", "MISSING"]);
  });

  it("breaks a dollar tie with RevPAU and ignores a negative peer gap", () => {
    const ranked = rankByMarginImpact([
      { code: "A", impactCents: 100n, revpauDeltaCents: 5n },
      { code: "B", impactCents: 100n, revpauDeltaCents: 20n },
    ]);
    expect(ranked.map((row) => row.code)).toEqual(["B", "A"]);
    expect(peerGapPerUnit(300n, [100n, 400n])).toBe(200n);
    expect(dollarsAtStake(200n, 10)).toBe(2_000n);
    expect(dollarsAtStake(-1n, 10)).toBeNull();
    expect(dollarsAtStake(10n, 0)).toBeNull();
    expect(paybackMonths(1_000n, 300n)).toBe(3);
    expect(paybackMonths(null, 300n)).toBeNull();
  });

  it("marks stale observations and explains the first saved score", () => {
    expect(observationIsStale("2026-01-01", "2026-08-31")).toBe(true);
    expect(observationIsStale("2026-08-01", "2026-08-31")).toBe(false);
    const next: ScoreSnapshot = {
      periodLabel: "2026-08",
      revpauCents: "25000",
      noiMarginBps: null,
      lossToLeaseCents: "50000",
      vacancyLossCents: "10000",
      otherIncomePerOccupiedCents: null,
      payrollPerUnitCents: null,
      controllableOpexPerUnitCents: null,
      illustrativeRevpauCents: null,
      observationCount: 1,
      latestSource: "PM weekly comp",
      latestAsOf: "2026-08-20",
      latestValueCents: "110000",
    };
    const first = whatChanged(null, next);
    expect(first[0]?.cause).toMatch(/first saved score/);
    expect(first[0]?.after).toContain("PM weekly comp");
    expect(first[0]?.after).toContain("2026-08-20");
    const prior = { ...next, observationCount: 0, latestSource: null, latestAsOf: null, latestValueCents: null, revpauCents: "20000", revenueBase: "book-egi" as const };
    const nextLabeled = { ...next, revenueBase: "book-egi" as const };
    const delta = whatChanged(prior, nextLabeled);
    expect(delta.find((row) => row.label === "RevPAU")?.cause).toMatch(/Book EGI/);
    const switched = whatChanged({ ...prior, revenueBase: "rent-roll" }, nextLabeled);
    expect(switched.find((row) => row.label === "RevPAU")?.cause).toMatch(/not compared/);
    expect(delta.some((row) => row.label === "RevPAU" && row.before !== NOT_AVAILABLE)).toBe(true);
    expect(delta.some((row) => row.label === "Latest market observation" && row.after.includes("2026-08-20"))).toBe(true);
  });
});

describe("asset plan analysis", () => {
  const units = [
    unit({ unitCode: "101", status: "OCCUPIED", marketRent: 100_000n, inPlaceRent: 50_000n, concessionCents: 2_500n, leaseEnd: "2026-10-15" }),
    unit({ unitCode: "102", status: "VACANT", marketRent: 10_000n, floorplan: "A1" }),
    unit({ unitCode: "103", status: "DOWN", marketRent: 0n, floorplan: "B1" }),
  ];

  it("puts loss-to-lease ahead of a larger occupancy gap when the dollars are smaller", () => {
    const plan = describePlan(facts({
      units,
      observations: [{
        id: "obs-1",
        sourceName: "PM weekly comp",
        sourceType: "PM_COMP",
        geography: "30301",
        floorplan: "A1",
        valueCents: 20_000n,
        rangeLowCents: null,
        rangeHighCents: null,
        trendNote: null,
        asOfDate: "2026-08-20",
        vintageDate: "2026-08-20",
        retrievedAt: "2026-08-21",
        termsNote: "Public asking rents only.",
      }],
    }));
    expect(plan.ltl).toBe(50_000n);
    expect(plan.signed).toBe(50_000n);
    expect(plan.vacancy).toBe(10_000n);
    expect(plan.concessions).toBe(2_500n);
    expect(plan.occupancyBps).toBe(Math.round((1 * 10_000) / 2));
    expect(plan.revpau).toBe(47_500n / 2n);
    expect(plan.recommendations.map((row) => row.code)[0]).toBe("RENT");
    expect(plan.recommendations.find((row) => row.code === "OCCUPANCY")?.impactCents).toBe(10_000n);
    expect(plan.illustrative.cents).toBe((50_000n - 2_500n + 20_000n) / 2n);
    expect(plan.band).toBeNull();
    expect(recommendedBand()).toBeNull();
  });

  it("does not invent RevPAU, margin, or a blend when inputs are missing", () => {
    const empty = describePlan(facts({ booksActive: false, egiCents: null, dealUnitCount: 0 }));
    expect(empty.revpau).toBeNull();
    expect(empty.margin).toBeNull();
    expect(presentCents(empty.revpau)).toBe(NOT_AVAILABLE);
    const books = describePlan(facts({
      booksActive: true,
      egiCents: 10_000n,
      noiCents: 2_500n,
      otherIncomeCents: 9_000n,
      payrollCents: 30_000n,
      controllableOpexCents: 40_000n,
      controllableBudgetCents: 10_000n,
      rubsCents: 100n,
      utilityCents: 0n,
      dealUnitCount: 4,
      units: [unit({ unitCode: "201", status: "OCCUPIED", inPlaceRent: 80_000n })],
      peers: [
        { code: "SPE-WBG", payrollPerUnitCents: 1n, controllablePerUnitCents: 1n, pmFeeBps: 1 },
        { code: "SPE-CVC", payrollPerUnitCents: 1_000n, controllablePerUnitCents: 1_000n, pmFeeBps: 100 },
      ],
    }));
    expect(books.margin).toBe(2500);
    expect(books.revpau).toBe(10_000n / 1n);
    expect(books.otherPerOccupied).toBe(9_000n);
    expect(books.recovery).toBeNull();
    expect(books.peers.map((row) => row.code)).toEqual(["SPE-CVC"]);
    expect(excludeSelf(books.peers, "spe-wbg")).toEqual(books.peers);
  });

  it("leaves illustrative RevPAU blank when two asking rents would need a blend", () => {
    const plan = describePlan(facts({
      units: [
        unit({ unitCode: "101", status: "OCCUPIED", inPlaceRent: 50_000n, marketRent: 50_000n }),
        unit({ unitCode: "102", status: "VACANT", marketRent: 10_000n, floorplan: "A1" }),
      ],
      observations: [
        { id: "a", sourceName: "One", sourceType: "PM_COMP", geography: "30301", floorplan: "A1", valueCents: 11_000n, rangeLowCents: null, rangeHighCents: null, trendNote: null, asOfDate: "2026-08-20", vintageDate: null, retrievedAt: "2026-08-21", termsNote: "Public." },
        { id: "b", sourceName: "Two", sourceType: "PM_COMP", geography: "30301", floorplan: "A1", valueCents: 12_000n, rangeLowCents: null, rangeHighCents: null, trendNote: null, asOfDate: "2026-08-20", vintageDate: null, retrievedAt: "2026-08-21", termsNote: "Public." },
      ],
    }));
    expect(plan.illustrative.cents).toBeNull();
    expect(plan.illustrative.note).toMatch(/does not blend/);
    expect(plan.blend.version).toBe("phase1-no-blend-v1");
  });

  it("keeps a property-level index out of illustrative RevPAU and ignores a zero market rent", () => {
    const plan = describePlan(facts({
      units: [
        unit({ unitCode: "101", status: "OCCUPIED", inPlaceRent: 50_000n, marketRent: 50_000n, concessionCents: 1_000n }),
        unit({ unitCode: "102", status: "VACANT", marketRent: 0n, floorplan: "A1", concessionCents: 9_000n }),
      ],
      observations: [
        { id: "z", sourceName: "ZORI", sourceType: "ZORI", geography: "30301", floorplan: null, valueCents: 150_000n, rangeLowCents: null, rangeHighCents: null, trendNote: null, asOfDate: "2026-08-20", vintageDate: null, retrievedAt: "2026-08-21", termsNote: "Data Provided by Zillow Group." },
      ],
    }));
    expect(plan.illustrative.cents).toBeNull();
    expect(plan.illustrative.note).toMatch(/context only/);
    expect(plan.recommendations.find((row) => row.code === "RENT")?.sourceLabel).toContain("2026-08-16");
    const rows = floorPlanRows(facts({
      units: [
        unit({ unitCode: "101", status: "OCCUPIED", concessionCents: 1_000n, floorplan: "A1" }),
        unit({ unitCode: "102", status: "VACANT", concessionCents: 9_000n, floorplan: "A1" }),
      ],
    }));
    expect(rows[0]?.concessionCents).toBe(1_000n);
  });

  it("keeps a gain-to-lease in the signed figure and out of the floored figure", () => {
    const plan = describePlan(facts({
      units: [unit({ unitCode: "101", status: "OCCUPIED", marketRent: 80_000n, inPlaceRent: 90_000n })],
    }));
    expect(plan.ltl).toBe(0n);
    expect(plan.signed).toBe(-10_000n);
  });
});

describe("asset plan boundaries", () => {
  it("rejects resident fields, blocked sources, and a ZORI row without the credit", () => {
    expect(() => assertNoResidentKeys({ residentName: "Hidden" })).toThrow(PLAN_RESIDENT);
    const payload = { residentName: "Hidden Person", balanceCents: 4400, moveOut: "2026-07-01", email: "a@b.c" };
    const dates = publicLeaseDates(payload);
    expect(JSON.stringify(dates)).not.toContain("Hidden");
    expect(JSON.stringify(dates)).not.toContain("4400");
    expect(JSON.stringify(dates)).not.toContain("a@b.c");
    expect(dates.moveOut).toBe("2026-07-01");
    expect(() => validateWeeklyUpdate({
      sourceName: "Apartments.com feed",
      sourceType: "PUBLIC",
      geography: "30301",
      asOfDate: "2026-08-20",
      retrievedAt: "2026-08-21",
      termsNote: "public",
      value: "10",
    })).toThrow(PLAN_BLOCKED_SOURCE);
    expect(() => validateWeeklyUpdate({
      sourceName: "ZORI",
      sourceType: "ZORI",
      geography: "Atlanta",
      asOfDate: "2026-08-16",
      retrievedAt: "2026-08-20",
      termsNote: "Uploaded by hand",
      value: "1500",
    })).toThrow(PLAN_ZORI_CREDIT);
    const zori = validateWeeklyUpdate({
      sourceName: "ZORI metro",
      sourceType: "ZORI",
      geography: "Atlanta",
      asOfDate: "2026-08-16",
      retrievedAt: "2026-08-20",
      termsNote: "Data Provided by Zillow Group. Uploaded by hand.",
      value: "1,500.00",
    });
    expect(zori.valueCents).toBe(150_000n);
    expect(decisionSideEffects()).toEqual({ external: false, pmsWrite: false, deletesHistory: false });
    expect(recommendedBand()).toBeNull();
  });

  it("blocks a viewer and does not give plan writes a path into the books", () => {
    expect(() => assertCanMutatePlan("viewer")).toThrow(AssetPlanError);
    expect(() => assertCanMutatePlan("viewer")).toThrow(PLAN_VIEWER);
    expect(assertCanMutatePlan("principal")).toBeUndefined();
    const store = readFileSync("src/lib/asset-mgmt/store.ts", "utf8");
    const route = readFileSync("src/app/api/deals/[code]/plan/route.ts", "utf8");
    expect(store).not.toMatch(/prisma\.(unit|journal|entity|loan)\.(delete|update|create)/);
    expect(store).not.toMatch(/fetch\(/);
    expect(route).not.toMatch(/export async function DELETE/);
    expect(route).not.toMatch(/fetch\(/);
    expect(store).toContain("SPE");
    expect(store).toContain("external: false");
    expect(store).not.toMatch(/buildOperatingPackage|openPeriod/);
    expect(store).toContain('status: "IDEA"');
    const page = readFileSync("src/app/deals/[code]/plan/page.tsx", "utf8");
    expect(page).not.toMatch(/ReportShell|buildAllStatements|buildOperatingPackage|openPeriod/);
    expect(page).toContain("readPlanBooks");
  });

  it("rejects impossible dates, future dates, retrieved-before-as-of, and listing-site names", () => {
    expect(() => assertPlanPeriod(1800, 1)).toThrow(PLAN_PERIOD_RANGE);
    expect(() => assertPlanPeriod(2026, 13)).toThrow(PLAN_PERIOD_RANGE);
    expect(() => assertPlanPeriod(2026, 8)).not.toThrow();
    const base = {
      sourceType: "PUBLIC",
      geography: "30301",
      asOfDate: "2026-08-20",
      retrievedAt: "2026-08-21",
      termsNote: "This use is permitted.",
      value: "10",
    };
    expect(() => validateWeeklyUpdate({ ...base, sourceName: "PM survey", asOfDate: "2026-02-31" })).toThrow(PLAN_DATE);
    expect(() => validateWeeklyUpdate({ ...base, sourceName: "PM survey", asOfDate: "2099-01-01", retrievedAt: "2099-01-02" })).toThrow(PLAN_FUTURE);
    expect(() => validateWeeklyUpdate({ ...base, sourceName: "PM survey", retrievedAt: "2026-08-19" })).toThrow(PLAN_RETRIEVED_ORDER);
    for (const sourceName of ["Zumper feed", "Craigslist post", "Facebook Marketplace", "www.rent.com", "Realtor.com", "Apartment List"]) {
      expect(() => validateWeeklyUpdate({ ...base, sourceName })).toThrow(PLAN_BLOCKED_SOURCE);
    }
    expect(() => validateWeeklyUpdate({ ...base, sourceName: "Zillow listings", sourceType: "PUBLIC" })).toThrow(PLAN_BLOCKED_SOURCE);
    const zori = validateWeeklyUpdate({
      ...base,
      sourceName: "Zillow ZORI ZIP 30301",
      sourceType: "ZORI",
      termsNote: "Data Provided by Zillow Group. Uploaded by hand.",
      floorplan: "",
    });
    expect(zori.sourceType).toBe("ZORI");
    expect(zori.floorplan).toBeNull();
  });
});

describe("opening balance is not income-statement activity", () => {
  it("leaves book figures blank when the only lines are balance-sheet accounts", async () => {
    const { booksAreActive, controllableBudget, expensePerUnit } = await import("@/lib/asset-mgmt/load");
    const opening = [
      { accountCode: "1010", debit: 100n, credit: 0n },
      { accountCode: "3010", debit: 0n, credit: 100n },
    ];
    expect(booksAreActive(opening)).toBe(false);
    expect(booksAreActive([{ accountCode: "4010", debit: 0n, credit: 50n }])).toBe(true);
    expect(expensePerUnit(opening, ["5110", "5120"], 10)).toBeNull();
    expect(expensePerUnit([{ accountCode: "5110", debit: 0n, credit: 0n }, { accountCode: "4010", debit: 0n, credit: 1n }], ["5110"], 10)).toBeNull();
    const budget = new Map<string, bigint>([["5110", 1n]]);
    expect(controllableBudget(budget)).toBeNull();
    const full = new Map<string, bigint>([
      ["5110", 1n],
      ["5120", 1n],
      ["5210", 1n],
      ["5220", 1n],
      ["5410", 1n],
      ["5510", 1n],
      ["5610", 1n],
      ["5910", 1n],
      ["5990", 1n],
    ]);
    expect(controllableBudget(full)).toBe(9n);
    const quiet = describePlan(facts({
      booksActive: false,
      egiCents: null,
      payrollCents: null,
      dealUnitCount: 3,
      units: [unit({ unitCode: "101", status: "OCCUPIED", inPlaceRent: 50_000n, marketRent: 50_000n })],
    }));
    expect(quiet.revenueSource).not.toMatch(/Book EGI/);
    expect(presentCents(quiet.payrollPer)).toBe(NOT_AVAILABLE);
  });

  it("leaves payroll, the PM fee, and controllable opex blank when revenue is posted and those accounts are not", async () => {
    const { postedExpenseCents } = await import("@/lib/asset-mgmt/load");
    const { CONTROLLABLE_OPEX_CODES } = await import("@rcp/analytics");
    const revenueOnly = [{ accountCode: "4010", debit: 0n, credit: 120_000n }];
    const payrollCents = postedExpenseCents(revenueOnly, ["5110", "5120"]);
    const pmFeeCents = postedExpenseCents(revenueOnly, ["5910"]);
    const controllableOpexCents = postedExpenseCents(revenueOnly, CONTROLLABLE_OPEX_CODES);
    expect(payrollCents).toBeNull();
    expect(pmFeeCents).toBeNull();
    expect(controllableOpexCents).toBeNull();
    expect(postedExpenseCents([...revenueOnly, { accountCode: "5110", debit: 5_000n, credit: 0n }], ["5110", "5120"])).toBe(5_000n);
    const view = describePlan(facts({
      booksActive: true,
      egiCents: 120_000n,
      noiCents: 80_000n,
      payrollCents,
      pmFeeCents,
      controllableOpexCents,
      dealUnitCount: 10,
    }));
    expect(presentCents(view.payrollPer)).toBe(NOT_AVAILABLE);
    expect(presentBps(view.pmFeeBps)).toBe(NOT_AVAILABLE);
    expect(presentCents(view.opexPer)).toBe(NOT_AVAILABLE);
  });
});

describe.skipIf(isPostgresUrl(process.env.DATABASE_URL))("asset plan on the local database", () => {
  it("logs an approval on a demo SPE without changing the SPE", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { saveIncomeIdea, saveWeeklyUpdate, decideIncomeIdea } = await import("@/lib/asset-mgmt/store");
    const spe = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!spe) throw new Error("Seed SPE-WBG before running this test (npx tsx prisma/seed.ts)");
    const beforeUnits = await prisma.unit.count({ where: { entityId: spe.id } });
    const name = spe.name;
    const stamp = new Date();
    try {
      const weekly = await saveWeeklyUpdate({
        entityId: spe.id,
        year: 2026,
        month: 8,
        actor: "principal",
        input: {
          sourceName: "EXAMPLE phase 1 test",
          sourceType: "PM_COMP",
          geography: "30301",
          floorplan: null,
          beds: null,
          valueCents: 150_000n,
          rangeLowCents: null,
          rangeHighCents: null,
          trendNote: null,
          specialsNote: null,
          vintageDate: "2026-08-01",
          asOfDate: "2026-08-20",
          retrievedAt: "2026-08-21",
          termsNote: "Example only. Public asking rents.",
        },
      });
      expect(weekly.external).toBe(false);
      const idea = await saveIncomeIdea({
        entityId: spe.id,
        year: 2026,
        month: 8,
        actor: "principal",
        input: {
          category: "Pet",
          title: "EXAMPLE pet rent",
          currentCaptureCents: 100n,
          fullRolloutCents: 400n,
          setupCostCents: 0n,
          ownerName: "Principal",
          steps: "Counsel reviews the addendum.",
          legalNote: "Not rolled out by the app.",
        },
      });
      const decision = await decideIncomeIdea({
        entityId: spe.id,
        year: 2026,
        month: 8,
        actor: "principal",
        input: { opportunityId: idea.id, decision: "APPROVE", reason: "Example approval for the log.", ownerName: "Principal", dueDate: null },
      });
      expect(decision.external).toBe(false);
      expect(decision.status).toBe("APPROVED");
      const events = await prisma.planEvent.findMany({
        where: { plan: { entityId: spe.id }, createdAt: { gte: stamp } },
      });
      expect(events.some((row) => row.kind === "DECISION")).toBe(true);
      expect(events.some((row) => row.kind === "ACTION")).toBe(true);
      expect(events.some((row) => row.kind === "WEEKLY_UPDATE")).toBe(true);
      expect(await prisma.unit.count({ where: { entityId: spe.id } })).toBe(beforeUnits);
      const after = await prisma.entity.findUnique({ where: { id: spe.id } });
      expect(after?.name).toBe(name);
      expect(after?.code).toBe("SPE-WBG");
    } finally {
      await prisma.planEvent.deleteMany({ where: { plan: { entityId: spe.id }, createdAt: { gte: stamp } } });
      await prisma.planRecommendation.deleteMany({ where: { plan: { entityId: spe.id }, createdAt: { gte: stamp } } });
      await prisma.marketObservation.deleteMany({ where: { plan: { entityId: spe.id }, sourceName: "EXAMPLE phase 1 test" } });
      await prisma.incomeOpportunity.deleteMany({ where: { plan: { entityId: spe.id }, title: "EXAMPLE pet rent" } });
      const remaining = await prisma.planEvent.count({ where: { plan: { entityId: spe.id } } });
      if (remaining === 0) await prisma.assetPlan.deleteMany({ where: { entityId: spe.id } });
    }
  }, 60_000);

  it("does not open a period when the plan is viewed or updated", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { readPlanBooks } = await import("@/lib/asset-mgmt/load");
    const { saveIncomeIdea, saveWeeklyUpdate, decideIncomeIdea } = await import("@/lib/asset-mgmt/store");
    const spe = await prisma.entity.findUnique({ where: { code: "SPE-WBG" } });
    if (!spe) throw new Error("Seed SPE-WBG before running this test (npx tsx prisma/seed.ts)");
    const beforePeriods = (await prisma.period.findMany({
      where: { entityId: spe.id },
      select: { id: true, year: true, month: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    })).map((row) => `${row.id}:${row.year}-${row.month}`);
    const beforeChecks = await prisma.closeChecklistItem.count({ where: { period: { entityId: spe.id } } });
    const stamp = new Date();
    try {
      const july = await readPlanBooks({
        entityId: spe.id,
        entityCode: spe.code,
        year: 2026,
        month: 7,
        dealUnitCount: spe.unitCount,
        businessPlanNote: spe.businessPlan,
        includePeers: false,
      });
      expect(july.fellBack).toBe(false);
      expect(july.facts.booksActive).toBe(false);
      expect(july.facts.egiCents).toBeNull();
      expect(july.facts.payrollCents).toBeNull();
      expect(july.facts.rentRollAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const missing = await readPlanBooks({
        entityId: spe.id,
        entityCode: spe.code,
        year: 2031,
        month: 6,
        dealUnitCount: spe.unitCount,
        businessPlanNote: spe.businessPlan,
        includePeers: true,
      });
      expect(missing.fellBack).toBe(true);
      expect(missing.year).not.toBe(2031);
      const weekly = await saveWeeklyUpdate({
        entityId: spe.id,
        year: 2031,
        month: 6,
        actor: "principal",
        input: {
          sourceName: "EXAMPLE no period",
          sourceType: "PM_COMP",
          geography: "30301",
          floorplan: "A1",
          beds: null,
          valueCents: 100n,
          rangeLowCents: null,
          rangeHighCents: null,
          trendNote: null,
          specialsNote: "one month free",
          vintageDate: null,
          asOfDate: "2026-08-20",
          retrievedAt: "2026-08-21",
          termsNote: "Example only. Public asking rents.",
        },
      });
      expect(weekly.external).toBe(false);
      const idea = await saveIncomeIdea({
        entityId: spe.id,
        year: 2031,
        month: 6,
        actor: "principal",
        input: {
          category: "Parking",
          title: "EXAMPLE no period idea",
          currentCaptureCents: 1n,
          fullRolloutCents: 2n,
          setupCostCents: null,
          ownerName: null,
          steps: null,
          legalNote: null,
        },
      });
      await decideIncomeIdea({
        entityId: spe.id,
        year: 2031,
        month: 6,
        actor: "principal",
        input: { opportunityId: idea.id, decision: "APPROVE", reason: "Example only.", ownerName: null, dueDate: null },
      });
      await expect(decideIncomeIdea({
        entityId: spe.id,
        year: 2031,
        month: 6,
        actor: "principal",
        input: { opportunityId: idea.id, decision: "APPROVE", reason: "Again.", ownerName: null, dueDate: null },
      })).rejects.toThrow(/Only an idea/);
      const stillThere = await prisma.period.findMany({
        where: { id: { in: beforePeriods.map((row) => row.slice(0, row.indexOf(":"))) } },
        select: { id: true },
      });
      expect(stillThere).toHaveLength(beforePeriods.length);
      expect(await prisma.closeChecklistItem.count({ where: { periodId: { in: beforePeriods.map((row) => row.slice(0, row.indexOf(":"))) } } })).toBe(beforeChecks);
      expect(await prisma.period.findUnique({ where: { entityId_year_month: { entityId: spe.id, year: 2031, month: 6 } } })).toBeNull();
    } finally {
      await prisma.planEvent.deleteMany({ where: { plan: { entityId: spe.id }, createdAt: { gte: stamp } } });
      await prisma.planRecommendation.deleteMany({ where: { plan: { entityId: spe.id }, createdAt: { gte: stamp } } });
      await prisma.marketObservation.deleteMany({ where: { plan: { entityId: spe.id }, sourceName: "EXAMPLE no period" } });
      await prisma.incomeOpportunity.deleteMany({ where: { plan: { entityId: spe.id }, title: "EXAMPLE no period idea" } });
      const remaining = await prisma.planEvent.count({ where: { plan: { entityId: spe.id } } });
      if (remaining === 0) await prisma.assetPlan.deleteMany({ where: { entityId: spe.id } });
    }
  }, 60_000);
});
