import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cashFlowAfterDebtServiceCents, cfadsCents, cfbdsCents } from "@rcp/analytics";
import {
  SuspenseOpenError,
  applyWaterfallTemplate,
  balanceSheetDeltaJournal,
  buildBalanceSheet,
  buildIncomeStatement,
  dollars,
  incomeStatementJournal,
  journalBalances,
  runWaterfall,
  assertSuspenseClear,
  type PostedLine,
} from "@rcp/ledger";
import {
  classifyChargeCode,
  hardTieFailures,
  leaseExpirationSummary,
  mapNormalizedLabel,
  mapT12LabelToAccount,
  rentRollGpr,
  rentRollNonRevenue,
  runRentRollTieOuts,
  signedLossToLease,
  type UnitSnapshot,
} from "@rcp/properties";
import { answerOffline, type OfflineBundle } from "@/lib/expert/offline-coach";
import { readExpertContext } from "@/lib/expert/nav";
import { describe, expect, it } from "vitest";

function L(accountCode: string, debit: bigint, credit: bigint): PostedLine {
  return { accountCode, debit, credit };
}

const emptyBundle: OfflineBundle = {
  entity: { ok: false, error: "skip" },
  period: { ok: false, error: "skip" },
  completeness: { ok: false, error: "skip" },
  anomalies: { ok: false, error: "skip" },
  kpis: { ok: false, error: "skip" },
};

describe("CFADS / CFBDS regression — numbers unchanged", () => {
  it("pins cfadsCents at NOI 100000 − capex 33000 − reserves 6600 = 60400", () => {
    const input = {
      periodNoiCents: dollars(100_000),
      periodCapexCents: dollars(33_000),
      reserveRequirementCents: dollars(6_600),
    };
    expect(cfadsCents(input)).toBe(dollars(60_400));
    expect(cfbdsCents(input)).toBe(cfadsCents(input));
  });

  it("keeps the AM fee out of cash flow before and after debt service", () => {
    const cfbds = cfbdsCents({
      periodNoiCents: dollars(100_000),
      periodCapexCents: dollars(33_000),
      reserveRequirementCents: dollars(6_600),
    });
    const after = cashFlowAfterDebtServiceCents({ cfbdsOrCfadsCents: cfbds, debtServiceCents: dollars(40_000) });
    expect(after).toBe(dollars(20_400));
    expect(after).toBe(cfbds - dollars(40_000));
  });

  it("pins the $12M simple pref+promote waterfall at GP 240000 and LP 11760000", () => {
    const result = runWaterfall({
      config: applyWaterfallTemplate("simple_pref_promote"),
      lpContributedCents: dollars(10_000_000),
      unreturnedCapitalCents: dollars(10_000_000),
      unpaidPrefCents: 0n,
      prefPaidToDateCents: 0n,
      periodMonths: 12,
      distributableCents: dollars(12_000_000),
    });
    expect(result.gpCents).toBe(dollars(240_000));
    expect(result.lpCents).toBe(dollars(11_760_000));
    expect(result.lpCents + result.gpCents).toBe(dollars(12_000_000));
  });
});

describe("monthly FS crosswalk and statements", () => {
  it("maps loss-to-lease to 4015 and leaves concessions on 4030", () => {
    expect(mapNormalizedLabel("Loss to Lease").accountCode).toBe("4015");
    expect(mapNormalizedLabel("Gain to Lease").accountCode).toBe("4015");
    expect(mapT12LabelToAccount("Loss to Lease")).toBe("4015");
    expect(mapT12LabelToAccount("Rent Concessions")).toBe("4030");
    expect(mapT12LabelToAccount("4022-000 Unit Rent")).toBe("4010");
    expect(classifyChargeCode("r-losstolease")).toBe("other");
    expect(classifyChargeCode("concession")).toBe("concession");
  });

  it("does not change NOI when 4015, 4040, and 4050 are unused", () => {
    const period: PostedLine[] = [
      L("4010", 0n, dollars(12_000)),
      L("4020", dollars(2_000), 0n),
      L("5110", dollars(3_000), 0n),
    ];
    const is = buildIncomeStatement({ throughEnd: period, inPeriod: period });
    expect(is.gpr).toBe(dollars(12_000));
    expect(is.egr).toBe(dollars(10_000));
    expect(is.noi).toBe(dollars(7_000));
    expect(is.lossToLease).toBe(0n);
    expect(is.nonRevenueUnits).toBe(0n);
  });

  it("treats 4015 as signed loss (positive) or gain (negative)", () => {
    const loss = buildIncomeStatement({
      throughEnd: [L("4010", 0n, dollars(1_000)), L("4015", dollars(100), 0n)],
      inPeriod: [L("4010", 0n, dollars(1_000)), L("4015", dollars(100), 0n)],
    });
    expect(loss.lossToLease).toBe(dollars(100));
    expect(loss.egr).toBe(dollars(900));
    const gain = buildIncomeStatement({
      throughEnd: [L("4010", 0n, dollars(1_000)), L("4015", 0n, dollars(40))],
      inPeriod: [L("4010", 0n, dollars(1_000)), L("4015", 0n, dollars(40))],
    });
    expect(gain.lossToLease).toBe(dollars(-40));
    expect(gain.egr).toBe(dollars(1_040));
  });

  it("splits prior-year earnings and current-year earnings without changing total equity", () => {
    const opening = [L("1010", dollars(50_000), 0n), L("3010", 0n, dollars(50_000))];
    const period = [L("4010", 0n, dollars(1_000)), L("1010", dollars(1_000), 0n)];
    const bs = buildBalanceSheet({ throughEnd: [...opening, ...period], throughStart: opening, inPeriod: period });
    expect(bs.balanced).toBe(true);
    expect(bs.priorYearEarnings + bs.currentYearEarnings).toBe(dollars(1_000));
    expect(bs.currentYearEarnings).toBe(dollars(1_000));
    expect(bs.rows.find((row) => row.key === "re")?.label).toMatch(/prior years/i);
    expect(bs.rows.find((row) => row.key === "cni")?.label).toMatch(/Current-year/);
  });

  it("balances an income-statement import and parks unmapped lines on 1999", () => {
    const lines = incomeStatementJournal([
      { accountCode: "4010", signedCents: dollars(100) },
      { accountCode: "5110", signedCents: dollars(40) },
      { accountCode: "Not a real account", signedCents: dollars(5), memo: "Mystery" },
    ]);
    expect(journalBalances(lines)).toBe(true);
    expect(lines.some((line) => line.accountCode === "1999" && line.debit === dollars(5))).toBe(true);
  });

  it("moves a balance sheet onto imported ending nets and still balances", () => {
    const lines = balanceSheetDeltaJournal(new Map([["1010", dollars(10)]]), new Map([["1010", dollars(25)], ["3010", dollars(-15)]]));
    expect(journalBalances(lines)).toBe(true);
  });
});

describe("rent roll tie-outs and lease summary", () => {
  const unit = (partial: Partial<UnitSnapshot> & Pick<UnitSnapshot, "unitCode" | "status">): UnitSnapshot => ({
    floorplan: "A",
    beds: 1,
    bathsTenths: 10,
    sqft: 700,
    marketRent: dollars(1_000),
    inPlaceRent: 0n,
    leaseStart: null,
    leaseEnd: null,
    concessionCents: 0n,
    ...partial,
  });

  it("keeps offline down units out of GPR and deducts model units on 4040", () => {
    const units = [
      unit({ unitCode: "101", status: "OCCUPIED", inPlaceRent: dollars(900) }),
      unit({ unitCode: "102", status: "DOWN", marketRent: dollars(800), substatus: "DOWN" }),
      unit({ unitCode: "103", status: "OCCUPIED", marketRent: dollars(700), inPlaceRent: 0n, substatus: "MODEL" }),
    ];
    expect(rentRollGpr(units)).toBe(dollars(1_700));
    expect(rentRollNonRevenue(units)).toBe(dollars(700));
    expect(signedLossToLease(units)).toBe(dollars(800));
  });

  it("hard-fails a unit-count break and a missing rent roll, and warns when no tolerance is set", () => {
    const rows = runRentRollTieOuts({
      rentRollPresent: true,
      entityUnitCount: 2,
      unitCount: 1,
      rentableCount: 1,
      occupiedCount: 1,
      vacantCount: 0,
      downCount: 0,
      gprCents: dollars(100),
      scheduledRentCents: dollars(90),
      signedLtlCents: dollars(10),
      vacancyCents: 0n,
      concessionCents: 0n,
      nonRevenueCents: 0n,
      delinquencyCents: null,
      depositCents: dollars(20),
      prepaidCents: 0n,
      asOfDate: "2026-08-31",
      periodEnd: "2026-08-31",
      gl: {
        gpr: dollars(100),
        ltl: dollars(10),
        vacancy: 0n,
        concessions: 0n,
        nru: 0n,
        ar: 0n,
        deposits: dollars(20),
        depositCash: dollars(20),
        prepaid: 0n,
      },
      chargeMismatchCount: 0,
    });
    expect(rows.find((row) => row.id === "RR-7")?.detail).toMatch(/stub/i);
    expect(hardTieFailures(rows).map((row) => row.id)).toContain("RR-11");
    expect(rows.find((row) => row.id === "RR-1")?.severity).toBe("pass");
    const open = runRentRollTieOuts({
      rentRollPresent: true,
      entityUnitCount: 1,
      unitCount: 1,
      rentableCount: 1,
      occupiedCount: 1,
      vacantCount: 0,
      downCount: 0,
      gprCents: dollars(110),
      scheduledRentCents: dollars(90),
      signedLtlCents: dollars(10),
      vacancyCents: 0n,
      concessionCents: 0n,
      nonRevenueCents: 0n,
      delinquencyCents: null,
      depositCents: dollars(20),
      prepaidCents: 0n,
      asOfDate: "2026-08-31",
      periodEnd: "2026-08-31",
      gl: {
        gpr: dollars(100),
        ltl: 0n,
        vacancy: 0n,
        concessions: 0n,
        nru: 0n,
        ar: 0n,
        deposits: dollars(20),
        depositCash: dollars(20),
        prepaid: 0n,
      },
      chargeMismatchCount: 0,
    });
    expect(open.find((row) => row.id === "RR-1")?.severity).toBe("warning");
    expect(() => assertSuspenseClear(dollars(1))).toThrow(SuspenseOpenError);
    expect(() => assertSuspenseClear(0n)).not.toThrow();
  });

  it("buckets lease expirations by month", () => {
    const summary = leaseExpirationSummary(
      [
        {
          unitCode: "1",
          status: "OCCUPIED",
          marketRentCents: dollars(100),
          leaseRentCents: dollars(90),
          leaseStart: "2026-01-01",
          leaseEnd: "2026-09-30",
          moveIn: "2026-08-02",
          moveOut: null,
          mtm: false,
          balanceCents: dollars(15),
          depositCents: dollars(50),
        },
        {
          unitCode: "2",
          status: "OCCUPIED",
          marketRentCents: dollars(100),
          leaseRentCents: dollars(100),
          leaseStart: "2025-01-01",
          leaseEnd: null,
          moveIn: "2025-01-01",
          moveOut: "2026-08-20",
          mtm: true,
          balanceCents: 0n,
          depositCents: dollars(50),
        },
      ],
      "2026-08-31",
    );
    expect(summary.moveIns).toBe(1);
    expect(summary.moveOuts).toBe(1);
    expect(summary.mtmCount).toBe(1);
    expect(summary.buckets.find((bucket) => bucket.key === "2026-09")?.count).toBe(1);
    expect(summary.delinquencyCents).toBe(dollars(15));
    expect(summary.depositsCents).toBe(dollars(100));
  });
});

describe("month-end expert playbook", () => {
  it("teaches the Hampton August close click path", () => {
    const ctx = readExpertContext("/deals", new URLSearchParams("entity=SPE-HMTOS&period=2026-08"));
    const reply = answerOffline("How do I upload August close for Hampton?", ctx, emptyBundle);
    expect(reply.content).toMatch(/Gold nav \*\*Deals\*\*/);
    expect(reply.content).toMatch(/SPE-HMTOS/);
    expect(reply.content).toMatch(/\/deals\/SPE-HMTOS\/close/);
    expect(reply.content).toMatch(/2026-08/);
    expect(reply.content).toMatch(/511 units/);
    expect(reply.content).toMatch(/1PW/);
    expect(reply.content).toMatch(/Hard lock/);
    expect(reply.content).toMatch(/reason/);
    expect(reply.content).toMatch(/suspense/i);
    expect(reply.content).toMatch(/Offline down units stay out of GPR/);
    expect(reply.content).toMatch(/Model, employee, and admin units stay inside GPR/);
  });
});

describe("monthly FS standard is committed", () => {
  it("keeps the attached standard in docs", () => {
    const text = readFileSync(resolve("docs/RCP_MONTHLY_FS_STANDARD.md"), "utf8");
    expect(text).toContain("RCP Monthly Financial Statement Format");
    expect(text).toContain("4015");
    expect(text).toMatch(/End of standard/);
  });
});
