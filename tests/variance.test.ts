import { dollars } from "@rcp/ledger";
import {
  buildOperatingStatement,
  incomeStatementFromBudget,
  pairVariance,
} from "@rcp/reporting";
import { buildIncomeStatement, type PostedLine } from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("budget variance", () => {
  it("computes line and percent variance in integer math", () => {
    const pair = pairVariance(dollars(90), dollars(100), dollars(80));
    expect(pair.variance).toBe(dollars(-10));
    expect(pair.varianceBps).toBe(-1000);
    expect(pair.mom).toBe(dollars(10));
    expect(pair.momBps).toBe(1250);
  });

  it("returns null percent when the base is zero", () => {
    expect(pairVariance(dollars(10), 0n, 0n).varianceBps).toBeNull();
    expect(pairVariance(dollars(10), 0n, 0n).momBps).toBeNull();
  });
});

describe("NOI bridge with budget", () => {
  it("keeps AM fees below NOI and shows GPR variance", () => {
    const period: PostedLine[] = [
      { accountCode: "1110", debit: dollars(12_000), credit: 0n },
      { accountCode: "4010", debit: 0n, credit: dollars(12_000) },
      { accountCode: "4020", debit: dollars(2_000), credit: 0n },
      { accountCode: "1110", debit: 0n, credit: dollars(2_000) },
      { accountCode: "5110", debit: dollars(3_000), credit: 0n },
      { accountCode: "1010", debit: 0n, credit: dollars(3_000) },
      { accountCode: "6310", debit: dollars(500), credit: 0n },
      { accountCode: "2310", debit: 0n, credit: dollars(500) },
    ];
    const actual = buildIncomeStatement({ throughEnd: period, inPeriod: period });
    const budget = incomeStatementFromBudget(
      new Map([
        ["4010", dollars(13_000)],
        ["4020", dollars(1_500)],
        ["5110", dollars(2_800)],
        ["6310", dollars(500)],
      ]),
    );
    budget.rows = [
      { key: "opex_payroll", label: "Payroll", amount: dollars(2_800), indent: 1 },
    ];
    const os = buildOperatingStatement({ actual, budget });
    const gpr = os.rows.find((r) => r.key === "gpr")!;
    expect(gpr.actual).toBe(dollars(12_000));
    expect(gpr.budget).toBe(dollars(13_000));
    expect(gpr.variance).toBe(dollars(-1_000));
    expect(os.actual.noi).toBe(dollars(7_000));
    expect(os.actual.amFees).toBe(dollars(500));
    expect(os.actual.noi).toBe(os.actual.netIncome + os.actual.interest + os.actual.depreciation + os.actual.amFees);
    const am = os.rows.find((r) => r.key === "am")!;
    const noi = os.rows.find((r) => r.key === "noi")!;
    const ni = os.rows.find((r) => r.key === "ni")!;
    expect(os.rows.findIndex((r) => r.key === "am")).toBeGreaterThan(os.rows.findIndex((r) => r.key === "noi"));
    expect(am.actual).toBe(dollars(500));
    expect(noi.actual).toBeGreaterThan(ni.actual!);
  });
});
