import { cipSpendLines, placeInServiceLines } from "@rcp/debt";
import {
  assertJournalBalanced,
  buildBalanceSheet,
  buildCashFlow,
  dollars,
  type PostedLine,
} from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("CIP journals", () => {
  it("capitalizes spend and places CIP in service in balance", () => {
    const spend = cipSpendLines({
      amountCents: dollars(45_000),
      cashCents: dollars(30_000),
      apCents: dollars(15_000),
    });
    expect(assertJournalBalanced(spend).ok).toBe(true);
    const pis = placeInServiceLines({
      amountCents: dollars(12_000),
      fixedAssetAccountCode: "1430",
    });
    expect(assertJournalBalanced(pis).ok).toBe(true);
  });

  it("treats CIP spend as investing and PIS as a wash", () => {
    const opening: PostedLine[] = [
      { accountCode: "1010", debit: dollars(80_000), credit: 0n },
      { accountCode: "3010", debit: 0n, credit: dollars(80_000) },
    ];
    const period: PostedLine[] = [
      { accountCode: "1460", debit: dollars(45_000), credit: 0n },
      { accountCode: "1010", debit: 0n, credit: dollars(30_000) },
      { accountCode: "2010", debit: 0n, credit: dollars(15_000) },
      { accountCode: "1430", debit: dollars(12_000), credit: 0n },
      { accountCode: "1460", debit: 0n, credit: dollars(12_000) },
    ];
    const throughEnd = [...opening, ...period];
    const bs = buildBalanceSheet({ throughEnd, throughStart: opening, inPeriod: period });
    const cf = buildCashFlow({ throughEnd, throughStart: opening, inPeriod: period });
    expect(bs.balanced).toBe(true);
    expect(cf.tiesToBalanceSheet).toBe(true);
    const cipRow = bs.rows.find((r) => r.key === "cip");
    expect(cipRow?.amount).toBe(dollars(33_000));
    expect(cf.cfi).toBe(-dollars(45_000));
  });

  it("refuses to mix cash/AP that does not equal CIP", () => {
    expect(() =>
      cipSpendLines({ amountCents: dollars(10), cashCents: dollars(6), apCents: dollars(3) }),
    ).toThrow(/must equal/);
  });
});
