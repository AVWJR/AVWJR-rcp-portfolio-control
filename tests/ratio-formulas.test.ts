import {
  CONTROLLABLE_OPEX_CODES,
  NON_CONTROLLABLE_OPEX_CODES,
  OPCO_GA_CODES,
  RATIO_DICTIONARY,
  RATIO_IDS,
  annualizePeriodNoi,
  cashBreakdown,
  distributableOperatingCashCents,
  cfadsCents,
  cfadsDscrBps,
  concentrationBps,
  gaRatioBps,
  getRatioDefinition,
  liquidityMonthsHundredths,
  noiConcentration,
  noiPerUnitCents,
  opexRatioBps,
  periodPpeAdditionsCents,
  ratioAvailability,
  ratioBps,
  trailingNoi,
} from "@rcp/analytics";
import { dollars } from "@rcp/ledger";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ratio helpers", () => {
  it("computes truncating basis-point ratios", () => {
    expect(ratioBps(dollars(1), dollars(3))).toBe(Number((dollars(1) * 10_000n) / dollars(3)));
    expect(ratioBps(1n, 0n)).toBeNull();
  });

  it("labels T12 incomplete when fewer than 12 months exist", () => {
    const t12 = trailingNoi([dollars(100), 0n]);
    expect(t12.definition).toBe("incomplete");
    expect(t12.monthsAvailable).toBe(2);
    expect(t12.noiCents).toBe(dollars(100));
    expect(annualizePeriodNoi(dollars(100))).toBe(dollars(1_200));
  });

  it("marks T12 ready only with 12 monthly observations", () => {
    const months = Array.from({ length: 12 }, () => dollars(10));
    const t12 = trailingNoi(months);
    expect(t12.definition).toBe("t12");
    expect(t12.noiCents).toBe(dollars(120));
  });

  it("computes NOI/unit, OpEx ratio, CFADS, and CFADS DSCR", () => {
    expect(noiPerUnitCents(dollars(264_000), 264)).toBe(dollars(1_000));
    expect(opexRatioBps(dollars(40), dollars(100))).toBe(4_000);
    const cfads = cfadsCents({
      periodNoiCents: dollars(100_000),
      periodCapexCents: dollars(33_000),
      reserveRequirementCents: dollars(6_600),
    });
    expect(cfads).toBe(dollars(60_400));
    expect(cfadsDscrBps(cfads, dollars(100_500))).toBe(Number((dollars(60_400) * 10_000n) / dollars(100_500)));
    expect(cfadsDscrBps(cfads, 0n)).toBeNull();
  });

  it("sums cash accounts and floors PPE disposals at zero", () => {
    const cash = cashBreakdown(
      new Map([
        ["1010", dollars(80)],
        ["1020", dollars(10)],
        ["1030", dollars(5)],
        ["1040", dollars(5)],
      ]),
    );
    expect(cash.total).toBe(dollars(100));
    expect(
      periodPpeAdditionsCents(new Map([["1460", dollars(10)]]), new Map([["1460", dollars(4)]])),
    ).toBe(0n);
    expect(
      periodPpeAdditionsCents(new Map([["1460", dollars(10)]]), new Map([["1460", dollars(45)], ["1430", dollars(12)]])),
    ).toBe(dollars(47));
  });

  it("bases cash-if-distributed-today on operating cash and excludes reserve, escrow, and deposits", () => {
    const amounts = new Map([
      ["1010", dollars(80)],
      ["1020", dollars(10)],
      ["1030", dollars(5)],
      ["1040", dollars(5)],
    ]);
    const cash = cashBreakdown(amounts);
    expect(cash.total).toBe(dollars(100));
    expect(distributableOperatingCashCents(amounts)).toBe(dollars(80));
    expect(distributableOperatingCashCents(amounts)).toBe(cash.operating);
    expect(distributableOperatingCashCents(amounts) + cash.reserve + cash.escrow + cash.deposits).toBe(cash.total);
  });

  it("computes G&A% and liquidity months in hundredths", () => {
    expect(gaRatioBps(dollars(25_300), dollars(10_090))).toBe(Number((dollars(25_300) * 10_000n) / dollars(10_090)));
    expect(liquidityMonthsHundredths(dollars(200), dollars(80))).toBe(250);
    expect(liquidityMonthsHundredths(dollars(200), 0n)).toBeNull();
  });

  it("concentrates NOI shares that sum to 10_000 bps when the whole is positive", () => {
    const rows = noiConcentration([
      { entityCode: "A", entityName: "A", noiCents: dollars(50), unitCount: 10 },
      { entityCode: "B", entityName: "B", noiCents: dollars(50), unitCount: 10 },
    ]);
    expect(rows[0]?.shareBps).toBe(5_000);
    expect(rows[1]?.shareBps).toBe(5_000);
    expect(concentrationBps(1n, 0n)).toBeNull();
  });

  it("tags utilities, insurance, and taxes as non-controllable and the PM fee as controllable", () => {
    expect(CONTROLLABLE_OPEX_CODES).toEqual(["5110", "5120", "5210", "5220", "5410", "5510", "5610", "5910", "5990"]);
    expect(NON_CONTROLLABLE_OPEX_CODES).toEqual(["5310", "5320", "5330", "5340", "5350", "5710", "5810"]);
    expect(OPCO_GA_CODES).toEqual(["5110", "5610", "5990"]);
  });
});

describe("ratio dictionary", () => {
  it("exports a definition for every ratio id", () => {
    for (const id of RATIO_IDS) {
      const def = getRatioDefinition(id);
      expect(def?.id).toBe(id);
      expect(def?.formula.length).toBeGreaterThan(3);
    }
    expect(RATIO_DICTIONARY).toHaveLength(RATIO_IDS.length);
  });

  it("keeps LTV and delinquency gated", () => {
    expect(getRatioDefinition("ltv")?.status).toBe("gated");
    expect(getRatioDefinition("delinquency")?.status).toBe("gated");
    expect(ratioAvailability("ltl").ready).toBe(false);
    expect(ratioAvailability("delinquency").ready).toBe(false);
  });

  it("labels DSCR as period NOI and debt yield as annualized period NOI", () => {
    expect(getRatioDefinition("dscr")?.noiDefinition).toBe("period");
    expect(getRatioDefinition("dscr")?.formula).toContain("Period NOI");
    expect(getRatioDefinition("debt_yield")?.noiDefinition).toBe("annualized_period");
    expect(getRatioDefinition("debt_yield")?.formula).toContain("Period NOI × 12");
    expect(getRatioDefinition("economic_occupancy_book")?.formula).toBe("EGI ÷ GPR");
  });

  it("stays in lockstep with the in-repo markdown dictionary", () => {
    const md = readFileSync(resolve("docs/RCP_RATIO_DICTIONARY_STUB.md"), "utf8");
    for (const id of RATIO_IDS) {
      expect(md).toContain(id);
    }
    expect(md).toContain("EGI − in-NOI OpEx");
    expect(md).toContain("do not divide UPB by book cost");
    expect(md).toContain("not a GAAP consolidation");
  });
});
