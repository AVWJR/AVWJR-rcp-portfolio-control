import { dealsVisibleToLp, lpCanSeeDeal } from "@/lib/lp-scope";
import { describe, expect, it } from "vitest";

describe("LP deal scope", () => {
  const deals = ["SPE-WBG", "SPE-CVC", "SPE-HCR"];

  it("returns every deal when scoping is not configured", () => {
    expect(dealsVisibleToLp(deals, null)).toEqual(deals);
    expect(dealsVisibleToLp(deals, undefined)).toEqual(deals);
    expect(lpCanSeeDeal("SPE-WBG", null)).toBe(true);
  });

  it("limits an LP to the deals on their list", () => {
    expect(dealsVisibleToLp(deals, ["SPE-CVC"])).toEqual(["SPE-CVC"]);
    expect(lpCanSeeDeal("SPE-CVC", ["SPE-CVC"])).toBe(true);
    expect(lpCanSeeDeal("SPE-WBG", ["SPE-CVC"])).toBe(false);
    expect(dealsVisibleToLp(deals, [])).toEqual([]);
  });
});
