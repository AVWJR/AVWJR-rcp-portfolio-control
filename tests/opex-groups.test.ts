import { OPEX_GROUPS as ledgerGroups } from "@rcp/ledger";
import { OPEX_GROUPS as reportingGroups } from "@rcp/reporting";
import { describe, expect, it } from "vitest";

describe("OPEX_GROUPS", () => {
  it("is a single shared list from the ledger package", () => {
    expect(reportingGroups).toBe(ledgerGroups);
    expect(ledgerGroups.map((g) => g.code)).toEqual([
      "5110",
      "5210",
      "5310",
      "5410",
      "5510",
      "5610",
      "5710",
      "5810",
      "5910",
      "5990",
    ]);
  });
});
