import {
  applyWaterfallTemplate,
  dollars,
  gpCoInvestCapital,
  gpShareBps,
  lookThroughConfig,
  prefAccrualCents,
  runWaterfall,
  simplePrefCents,
  type WaterfallConfig,
  type WaterfallRunInput,
  type WaterfallTemplateId,
} from "@rcp/ledger";
import { describe, expect, it } from "vitest";

/** Fixed cash/distribution scenario used for every template (except look-through which ignores capital). */
const SCENARIO = {
  lpContributedCents: dollars(10_000_000),
  unreturnedCapitalCents: dollars(10_000_000),
  unpaidPrefCents: 0n,
  prefPaidToDateCents: 0n,
  periodMonths: 12,
  distributableCents: dollars(12_000_000),
};

function run(templateId: WaterfallTemplateId, extra: Partial<WaterfallRunInput> = {}, patch?: (c: WaterfallConfig) => WaterfallConfig) {
  let config = applyWaterfallTemplate(templateId);
  if (patch) config = patch(config);
  return runWaterfall({
    config,
    ...SCENARIO,
    ...extra,
  });
}

describe("waterfall templates apply", () => {
  it("look-through is the silent-safe default (100% GP/RCP)", () => {
    const c = lookThroughConfig();
    expect(c.templateId).toBe("look_through_100");
    expect(c.tiers).toHaveLength(1);
    expect(c.tiers[0]?.gpSplitBps).toBe(10_000);
  });

  it("simple pref+promote populates 8% pref, no catch-up, 80/20 residual", () => {
    const c = applyWaterfallTemplate("simple_pref_promote");
    expect(c.prefRateBps).toBe(800);
    expect(c.catchUpEnabled).toBe(false);
    expect(c.tiers.map((t) => t.kind)).toEqual(["ROC", "PREF", "PROMOTE"]);
    expect(c.tiers.at(-1)?.lpSplitBps).toBe(8_000);
    expect(c.tiers.at(-1)?.gpSplitBps).toBe(2_000);
  });

  it("institutional template turns catch-up on at 100%", () => {
    const c = applyWaterfallTemplate("institutional_catchup");
    expect(c.catchUpEnabled).toBe(true);
    expect(c.catchUpBps).toBe(10_000);
    expect(c.tiers.map((t) => t.kind)).toEqual(["ROC", "PREF", "CATCH_UP", "PROMOTE"]);
  });

  it("multi-hurdle has 8/12/15 promote bands", () => {
    const c = applyWaterfallTemplate("multi_hurdle_irr");
    const hurdles = c.tiers.filter((t) => t.kind === "PROMOTE").map((t) => t.hurdleIrrBps);
    expect(hurdles).toEqual([800, 1_200, 1_500]);
    expect(c.tiers.filter((t) => t.kind === "PROMOTE").map((t) => t.gpSplitBps)).toEqual([2_000, 3_000, 4_000]);
  });

  it("American flags clawback; European is LP-protective", () => {
    expect(applyWaterfallTemplate("american_deal").lookbackClawback).toBe(true);
    expect(applyWaterfallTemplate("european_fund").templateId).toBe("european_fund");
  });
});

describe("waterfall engine — fixed $12M on $10M capital / 8% pref / 12 months", () => {
  it("look-through sends 100% to GP/RCP", () => {
    const r = run("look_through_100");
    expect(r.lookThrough).toBe(true);
    expect(r.gpCents).toBe(dollars(12_000_000));
    expect(r.lpCents).toBe(0n);
    expect(r.allocatedCents).toBe(r.distributableCents);
    expect(gpShareBps(r)).toBe(10_000);
  });

  it("simple pref + promote: ROC $10M, pref $800k, residual 80/20 on $1.2M", () => {
    expect(simplePrefCents(dollars(10_000_000), 800, 12)).toBe(dollars(800_000));
    const r = run("simple_pref_promote");
    expect(r.lpCents + r.gpCents).toBe(dollars(12_000_000));
    expect(r.gpCents).toBe(dollars(240_000));
    expect(r.lpCents).toBe(dollars(11_760_000));
    expect(r.steps.find((s) => s.kind === "ROC")?.takenCents).toBe(dollars(10_000_000));
    expect(r.steps.find((s) => s.kind === "PREF")?.takenCents).toBe(dollars(800_000));
    expect(r.steps.find((s) => s.kind === "PROMOTE")?.gpCents).toBe(dollars(240_000));
  });

  it("institutional catch-up: GP ends at 20% of profits above ROC", () => {
    const r = run("institutional_catchup");
    // Profits above ROC = $2M. 20% = $400k GP. LP $11.6M.
    expect(r.gpCents).toBe(dollars(400_000));
    expect(r.lpCents).toBe(dollars(11_600_000));
    expect(r.steps.find((s) => s.kind === "CATCH_UP")?.gpCents).toBe(dollars(200_000));
  });

  it("multi-hurdle uses 8/12/15 dollar-pref bands then leftover at last split", () => {
    const r = run("multi_hurdle_irr");
    expect(r.lpCents + r.gpCents).toBe(dollars(12_000_000));
    // After ROC $10M, remaining $2M:
    // 8% of $10M = $800k @ 80/20 → GP $160k
    // 4% = $400k @ 70/30 → GP $120k
    // 3% = $300k @ 60/40 → GP $120k
    // leftover $500k @ 60/40 → GP $200k
    expect(r.gpCents).toBe(dollars(600_000));
    expect(r.lpCents).toBe(dollars(11_400_000));
  });

  it("American matches simple pref+promote and flags clawback", () => {
    const a = run("american_deal");
    const s = run("simple_pref_promote");
    expect(a.lpCents).toBe(s.lpCents);
    expect(a.gpCents).toBe(s.gpCents);
    expect(a.clawbackFlagged).toBe(true);
    expect(a.notes.join(" ")).toMatch(/clawback\/lookback/i);
  });

  it("European with gate closed pays no GP promote", () => {
    const r = run("european_fund", { europeanPromoteOpen: false });
    expect(r.europeanPromoteBlocked).toBe(true);
    expect(r.gpCents).toBe(0n);
    expect(r.lpCents).toBe(dollars(12_000_000));
  });

  it("European with $0 capital stays LP-protective (no silent promote)", () => {
    const r = run("european_fund", {
      lpContributedCents: 0n,
      unreturnedCapitalCents: 0n,
      europeanPromoteOpen: true,
    });
    expect(r.europeanPromoteBlocked).toBe(true);
    expect(r.gpCents).toBe(0n);
    expect(r.lpCents).toBe(dollars(12_000_000));
  });

  it("European with gate open matches simple residual promote", () => {
    const r = run("european_fund", { europeanPromoteOpen: true });
    expect(r.europeanPromoteBlocked).toBe(false);
    expect(r.gpCents).toBe(dollars(240_000));
    expect(r.lpCents).toBe(dollars(11_760_000));
  });

  it("does not invent a distribution from negative CFADS", () => {
    const r = run("simple_pref_promote", { distributableCents: dollars(-50_000) });
    expect(r.gpCents).toBe(0n);
    expect(r.lpCents).toBe(0n);
    expect(r.notes.join(" ")).toMatch(/negative/i);
  });

  it("GP co-invest is pari passu on ROC and pref, plus promote", () => {
    const r = run("simple_pref_promote", {}, (c) => ({ ...c, gpCoInvestBps: 500 }));
    const gpCap = gpCoInvestCapital(dollars(10_000_000), 500);
    expect(gpCap).toBeGreaterThan(0n);
    expect(r.gpCents).toBeGreaterThan(dollars(240_000));
    expect(r.lpCents + r.gpCents).toBe(dollars(12_000_000));
    const roc = r.steps.find((s) => s.kind === "ROC");
    expect(roc?.gpCents).toBeGreaterThan(0n);
  });

  it("Co-GP share 0 matches the two-party GP/RCP total (rcpCents = gpCents)", () => {
    const r = run("simple_pref_promote");
    expect(r.gpCents).toBe(dollars(240_000));
    expect(r.rcpCents).toBe(r.gpCents);
    expect(r.coGpCents).toBe(0n);
    expect(r.lpCents + r.rcpCents + r.coGpCents).toBe(dollars(12_000_000));
  });

  it("Co-GP 50% of promote splits GP residual between RCP and Co-GP", () => {
    const r = run("simple_pref_promote", {}, (c) => ({
      ...c,
      coGpName: "JV Partner",
      coGpOfPromoteBps: 5_000,
    }));
    expect(r.gpCents).toBe(dollars(240_000));
    expect(r.rcpCents).toBe(dollars(120_000));
    expect(r.coGpCents).toBe(dollars(120_000));
    expect(r.rcpCents + r.coGpCents).toBe(r.gpCents);
    expect(r.notes.join(" ")).toMatch(/Co-GP JV Partner/);
  });

  it("annual compounding pref on 1 year equals 8% of capital", () => {
    const accrued = prefAccrualCents({
      capitalCents: dollars(10_000_000),
      prefRateBps: 800,
      compounding: "ANNUAL",
      periodMonths: 12,
      prefPaidToDateCents: 0n,
    });
    expect(accrued).toBe(dollars(800_000));
  });
});
