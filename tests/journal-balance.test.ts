import { assertJournalBalanced, isJournalBalanced, UnbalancedJournalError, dollars } from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("double-entry journal balance", () => {
  it("accepts a two-line balanced journal", () => {
    const result = assertJournalBalanced([
      { accountCode: "1010", debit: dollars(100), credit: 0n },
      { accountCode: "3010", debit: 0n, credit: dollars(100) },
    ]);
    expect(result.ok).toBe(true);
    expect(result.debits).toBe(dollars(100));
    expect(result.credits).toBe(dollars(100));
  });

  it("rejects an unbalanced journal", () => {
    expect(() =>
      assertJournalBalanced([
        { accountCode: "1010", debit: dollars(100), credit: 0n },
        { accountCode: "3010", debit: 0n, credit: dollars(90) },
      ]),
    ).toThrow(UnbalancedJournalError);
    expect(
      isJournalBalanced([
        { accountCode: "1010", debit: dollars(100), credit: 0n },
        { accountCode: "3010", debit: 0n, credit: dollars(90) },
      ]),
    ).toBe(false);
  });

  it("rejects a line with both debit and credit", () => {
    expect(() =>
      assertJournalBalanced([
        { accountCode: "1010", debit: dollars(50), credit: dollars(50) },
        { accountCode: "3010", debit: 0n, credit: dollars(100) },
      ]),
    ).toThrow(/both a debit and a credit/);
  });

  it("rejects a single-line journal", () => {
    expect(() =>
      assertJournalBalanced([{ accountCode: "1010", debit: dollars(10), credit: 0n }]),
    ).toThrow(/at least two lines/);
  });
});
