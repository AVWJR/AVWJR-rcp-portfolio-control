import { dollars, reviewIntercompany } from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("intercompany matching", () => {
  it("hard-fails when SPE due-to does not match OpCo due-from", () => {
    const review = reviewIntercompany([
      {
        code: "SPE-WBG",
        type: "SPE",
        lines: [
          { accountCode: "6310", debit: dollars(100), credit: 0n },
          { accountCode: "2310", debit: 0n, credit: dollars(100) },
        ],
      },
      {
        code: "RCP-OPCO",
        type: "OPCO",
        lines: [
          { accountCode: "1310", debit: dollars(80), credit: 0n },
          { accountCode: "7010", debit: 0n, credit: dollars(80) },
        ],
      },
    ]);
    expect(review.ok).toBe(false);
    expect(review.icMatched).toBe(false);
    expect(review.amMatched).toBe(false);
    expect(review.findings.length).toBeGreaterThan(0);
  });

  it("passes when AM fee billing is mirrored", () => {
    const review = reviewIntercompany([
      {
        code: "SPE-WBG",
        type: "SPE",
        lines: [
          { accountCode: "6310", debit: dollars(4_740), credit: 0n },
          { accountCode: "2310", debit: 0n, credit: dollars(4_740) },
        ],
      },
      {
        code: "RCP-OPCO",
        type: "OPCO",
        lines: [
          { accountCode: "1310", debit: dollars(4_740), credit: 0n },
          { accountCode: "7010", debit: 0n, credit: dollars(4_740) },
        ],
      },
    ]);
    expect(review.ok).toBe(true);
    expect(review.speDueTo).toBe(dollars(4_740));
    expect(review.opcoDueFrom).toBe(dollars(4_740));
  });
});
