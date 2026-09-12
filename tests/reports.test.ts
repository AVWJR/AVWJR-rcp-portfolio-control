import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
  dollars,
  type PostedLine,
} from "@rcp/ledger";
import { describe, expect, it } from "vitest";

function L(accountCode: string, debit: bigint, credit: bigint): PostedLine {
  return { accountCode, debit, credit };
}

const opening: PostedLine[] = [
  L("1010", dollars(50_000), 0n),
  L("1420", dollars(400_000), 0n),
  L("2210", 0n, dollars(300_000)),
  L("3010", 0n, dollars(150_000)),
];

const period: PostedLine[] = [
  L("1110", dollars(10_000), 0n),
  L("4010", 0n, dollars(12_000)),
  L("4020", dollars(2_000), 0n),
  L("5110", dollars(3_000), 0n),
  L("1010", 0n, dollars(3_000)),
  L("6310", dollars(500), 0n),
  L("2310", 0n, dollars(500)),
  L("6210", dollars(1_000), 0n),
  L("1490", 0n, dollars(1_000)),
];

const throughEnd = [...opening, ...period];

describe("statement math", () => {
  it("keeps the trial balance in balance", () => {
    const tb = buildTrialBalance({ throughEnd });
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it("places asset management fees below NOI", () => {
    const is = buildIncomeStatement({ throughEnd, inPeriod: period });
    expect(is.gpr).toBe(dollars(12_000));
    expect(is.vacancy).toBe(dollars(2_000));
    expect(is.egi).toBe(dollars(10_000));
    expect(is.opex).toBe(dollars(3_000));
    expect(is.noi).toBe(dollars(7_000));
    expect(is.amFees).toBe(dollars(500));
    expect(is.depreciation).toBe(dollars(1_000));
    expect(is.netIncome).toBe(dollars(5_500));
    expect(is.noi).toBeGreaterThan(is.netIncome);
  });

  it("balances the sheet including unclosed net income", () => {
    const bs = buildBalanceSheet({
      throughEnd,
      throughStart: opening,
      inPeriod: period,
    });
    expect(bs.balanced).toBe(true);
    expect(bs.totalAssets).toBe(bs.totalLiabilities + bs.totalEquity);
  });

  it("ties cash flow to the cash rollforward", () => {
    const cf = buildCashFlow({
      throughEnd,
      throughStart: opening,
      inPeriod: period,
    });
    expect(cf.beginningCash).toBe(dollars(50_000));
    expect(cf.endingCash).toBe(dollars(47_000));
    expect(cf.tiesToBalanceSheet).toBe(true);
    expect(cf.beginningCash + cf.netChange).toBe(cf.endingCash);
  });
});
