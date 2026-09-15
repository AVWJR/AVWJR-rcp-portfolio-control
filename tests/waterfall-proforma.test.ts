import {
  annualizeMonthlyCfads,
  applyWaterfallTemplate,
  dollars,
  growCents,
  runDealProforma,
  runOpCoProforma,
  runWaterfall,
} from "@rcp/ledger";
import { describe, expect, it } from "vitest";

const CAPITAL = {
  lpContributedCents: dollars(10_000_000),
  unreturnedCapitalCents: dollars(10_000_000),
  unpaidPrefCents: 0n,
  prefPaidToDateCents: 0n,
};

describe("deal proforma uses the same waterfall as the live engine", () => {
  it("annualizes monthly CFADS × 12", () => {
    expect(annualizeMonthlyCfads(dollars(100_000))).toBe(dollars(1_200_000));
  });

  it("grows CFADS with truncating annual bps", () => {
    expect(growCents(dollars(1_000_000), 1_000, 1)).toBe(dollars(1_100_000));
  });

  it("year 1 on $12M matches simple pref+promote; year 2 is residual 80/20", () => {
    const config = applyWaterfallTemplate("simple_pref_promote");
    const pf = runDealProforma({
      config,
      ...CAPITAL,
      holdYears: 2,
      year1CfadsCents: dollars(12_000_000),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: 0n,
      entityCode: "SPE-HMTOS",
      entityName: "HMTOS",
    });
    const y1 = runWaterfall({
      config,
      ...CAPITAL,
      distributableCents: dollars(12_000_000),
      periodMonths: 12,
    });
    expect(pf.level).toBe("deal");
    expect(pf.years[0]?.lpCents).toBe(y1.lpCents);
    expect(pf.years[0]?.gpCents).toBe(y1.gpCents);
    expect(pf.years[0]?.rcpCents).toBe(y1.rcpCents);
    expect(pf.years[1]?.gpCents).toBe(dollars(2_400_000));
    expect(pf.years[1]?.lpCents).toBe(dollars(9_600_000));
    expect(pf.totals.lpCents + pf.totals.gpCents).toBe(dollars(24_000_000));
  });

  it("Co-GP 50% carries through the proforma RCP vs Co-GP columns", () => {
    const config = { ...applyWaterfallTemplate("simple_pref_promote"), coGpOfPromoteBps: 5_000, coGpName: "JV" };
    const pf = runDealProforma({
      config,
      ...CAPITAL,
      holdYears: 1,
      year1CfadsCents: dollars(12_000_000),
      cfadsGrowthBps: 0,
      exitEquityProceedsCents: 0n,
    });
    expect(pf.hasCoGp).toBe(true);
    expect(pf.totals.gpCents).toBe(dollars(240_000));
    expect(pf.totals.rcpCents).toBe(dollars(120_000));
    expect(pf.totals.coGpCents).toBe(dollars(120_000));
  });
});

describe("OpCo proforma aggregates deal waterfalls", () => {
  it("OpCo GPs = Σ RCP; OpCo LPs = Σ Deal LPs; Co-GP stays at the deal", () => {
    const config = { ...applyWaterfallTemplate("simple_pref_promote"), coGpOfPromoteBps: 5_000 };
    const look = applyWaterfallTemplate("look_through_100");
    const rolled = runOpCoProforma({
      deals: [
        {
          config,
          ...CAPITAL,
          holdYears: 1,
          year1CfadsCents: dollars(12_000_000),
          cfadsGrowthBps: 0,
          exitEquityProceedsCents: 0n,
          entityCode: "SPE-A",
          entityName: "A",
        },
        {
          config: look,
          lpContributedCents: 0n,
          unreturnedCapitalCents: 0n,
          unpaidPrefCents: 0n,
          prefPaidToDateCents: 0n,
          holdYears: 1,
          year1CfadsCents: dollars(1_000_000),
          cfadsGrowthBps: 0,
          exitEquityProceedsCents: 0n,
          entityCode: "SPE-B",
          entityName: "B",
        },
      ],
    });
    expect(rolled.level).toBe("opco");
    expect(rolled.platformModeled).toBe(false);
    expect(rolled.totals.dealLpCents).toBe(dollars(11_760_000));
    expect(rolled.totals.dealRcpCents).toBe(dollars(120_000) + dollars(1_000_000));
    expect(rolled.totals.dealCoGpCents).toBe(dollars(120_000));
    expect(rolled.totals.opcoGpCents).toBe(rolled.totals.dealRcpCents);
    expect(rolled.totals.opcoLpCents).toBe(0n);
  });

  it("optional OpCo pref splits RCP cash when modeled", () => {
    const config = applyWaterfallTemplate("simple_pref_promote");
    const rolled = runOpCoProforma({
      deals: [
        {
          config,
          ...CAPITAL,
          holdYears: 1,
          year1CfadsCents: dollars(12_000_000),
          cfadsGrowthBps: 0,
          exitEquityProceedsCents: 0n,
          entityCode: "SPE-A",
          entityName: "A",
        },
      ],
      platform: {
        prefRateBps: 800,
        lpContributedCents: dollars(100_000),
        lpSplitBps: 8_000,
        gpSplitBps: 2_000,
      },
    });
    expect(rolled.platformModeled).toBe(true);
    expect(rolled.totals.opcoLpCents + rolled.totals.opcoGpCents).toBe(rolled.totals.dealRcpCents);
    expect(rolled.totals.opcoLpCents).toBeGreaterThan(0n);
  });
});
