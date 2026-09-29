import { applyWaterfallTemplate, dollars, formatUsd, runWaterfall, summarizeWaterfall } from "@rcp/ledger";
import { audienceCfads, buildNarrative, buildPack, emptyDistributionActuals, waterfallSplitSentence } from "@rcp/reporting";
import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures/period-snapshot";

function appliedSnap() {
  const config = applyWaterfallTemplate("simple_pref_promote");
  const run = runWaterfall({
    config,
    distributableCents: dollars(12_000_000),
    lpContributedCents: dollars(10_000_000),
    unreturnedCapitalCents: dollars(10_000_000),
    unpaidPrefCents: 0n,
    prefPaidToDateCents: 0n,
    periodMonths: 12,
  });
  const tiers = summarizeWaterfall(run);
  const cashRun = runWaterfall({
    config,
    distributableCents: dollars(500_000),
    lpContributedCents: dollars(10_000_000),
    unreturnedCapitalCents: dollars(10_000_000),
    unpaidPrefCents: 0n,
    prefPaidToDateCents: 0n,
    periodMonths: 12,
  });
  return fixtureSnapshot({
    waterfallApplied: true,
    waterfallTemplateId: "simple_pref_promote",
    cfadsCents: dollars(12_000_000),
    cfadsLookThroughCents: dollars(12_000_000),
    cashLookThroughCents: dollars(500_000),
    cashTotalCents: dollars(500_000),
    cashLpCents: cashRun.lpCents,
    cashGpCents: cashRun.gpCents,
    cashRcpCents: cashRun.rcpCents,
    cashCoGpCents: cashRun.coGpCents,
    lpShareOfDistributableCents: run.lpCents,
    gpShareOfDistributableCents: run.gpCents,
    rcpShareOfDistributableCents: run.rcpCents,
    coGpShareOfDistributableCents: run.coGpCents,
    coGpName: run.coGpCents > 0n ? "Co-GP" : null,
    lpPrefUnpaidCents: run.unpaidPrefAfterCents,
    waterfallRocLpCents: tiers.rocLpCents,
    waterfallPrefPaidLpCents: tiers.prefLpCents,
    waterfallCatchUpGpCents: tiers.catchUpGpCents,
    waterfallPromoteGpCents: tiers.promoteGpCents,
    waterfallResidualLpCents: tiers.residualLpCents,
    waterfallNote: run.notes.join(" "),
  });
}

describe("packs and narratives follow the SPE waterfall", () => {
  it("look-through LP pack still cites the CFADS pool as the distributions proxy", () => {
    const snap = fixtureSnapshot();
    const lp = buildNarrative(snap, "lp");
    const text = lp.sections.map((s) => s.body).join(" ");
    expect(text).toMatch(/100% look-through/);
    expect(text).toContain(formatUsd(snap.cfadsCents));
    expect(audienceCfads(snap, "lp").cents).toBe(snap.cfadsLookThroughCents);
  });

  it("LP Monthly Investor Pack uses LP share — not gross SPE CFADS — once a template is saved", () => {
    const snap = appliedSnap();
    expect(snap.lpShareOfDistributableCents).toBe(dollars(11_760_000));
    expect(snap.gpShareOfDistributableCents).toBe(dollars(240_000));
    expect(snap.cfadsLookThroughCents).toBe(dollars(12_000_000));

    const lp = audienceCfads(snap, "lp");
    const gp = audienceCfads(snap, "gp");
    expect(lp.cents).toBe(snap.lpShareOfDistributableCents);
    expect(gp.cents).toBe(snap.gpShareOfDistributableCents);
    expect(lp.cents).not.toBe(snap.cfadsLookThroughCents);

    const narrative = buildNarrative(snap, "lp");
    const text = narrative.sections.map((s) => s.body).join(" ");
    expect(text).toContain("LP share after waterfall");
    expect(text).toContain(formatUsd(snap.lpShareOfDistributableCents));
    expect(text).toContain(formatUsd(snap.gpShareOfDistributableCents));
    expect(text).toContain("LP pref unpaid");
    expect(text).not.toMatch(/after waterfall \(RCP\/GP share\)/);
    expect(text).toMatch(/not gross SPE cash as if the LP owned 100%/);

    const pack = buildPack(snap, "monthly_investor");
    expect(pack.meta.audience).toBe("lp");
    const kpi = pack.slides.find((s) => s.kind === "kpis");
    expect(kpi && kpi.kind === "kpis").toBe(true);
    if (kpi && kpi.kind === "kpis") {
      const labels = kpi.kpis.map((k) => k.label).join(" ");
      expect(labels).toMatch(/LP share after waterfall/);
      expect(labels).toMatch(/LP pref unpaid/);
    }
    const appendix = pack.slides.find((s) => s.kind === "appendix");
    expect(appendix && appendix.kind === "appendix").toBe(true);
    if (appendix && appendix.kind === "appendix") {
      expect(appendix.tables.some((t) => /Deal waterfall/i.test(t.title))).toBe(true);
      const ask = pack.slides.find((s) => s.kind === "risks");
      expect(ask && ask.kind === "risks" && ask.ask).toMatch(/LP share/);
    }
    expect(waterfallSplitSentence(snap)).toMatch(/LP share/);
    expect(text).toMatch(/Distribution ledger: nothing posted yet/);
    expect(text).toMatch(/illustrative current-period waterfall is not cash paid/);
  });

  it("LP pack prints ledger actuals separately from the illustrative waterfall", () => {
    const snap = appliedSnap();
    snap.distributionActuals = {
      ...emptyDistributionActuals(),
      hasEvents: true,
      capitalSource: "ledger",
      capitalContributedCents: dollars(3_000_000),
      capitalReturnedCents: dollars(56_700),
      unreturnedCapitalCents: dollars(2_943_300),
      prefAccruedCents: dollars(59_622),
      prefPaidCents: 0n,
      prefUnpaidCents: dollars(59_622),
      cumulativeLpCents: dollars(56_700),
      dpiBps: 189,
    };
    const narrative = buildNarrative(snap, "lp").sections.map((s) => s.body).join(" ");
    expect(narrative).toMatch(/Distribution ledger actuals \(cash already paid/);
    expect(narrative).toMatch(/illustrative current-period waterfall is not cash paid/);
    expect(narrative).toContain(formatUsd(dollars(56_700)));
    expect(narrative).toContain("LP share after waterfall");
    const pack = buildPack(snap, "monthly_investor");
    const visuals = pack.slides.filter((s) => s.kind === "visuals").flatMap((s) => (s.kind === "visuals" ? s.visuals : []));
    expect(visuals.map((v) => v.chartId)).toEqual([
      "dist_capital_returned",
      "dist_pref_over_time",
      "dist_by_party",
      "dist_tier_gauge",
      "dist_dpi",
    ]);
    const appendix = pack.slides.find((s) => s.kind === "appendix");
    expect(appendix && appendix.kind === "appendix").toBe(true);
    if (appendix && appendix.kind === "appendix") {
      expect(appendix.tables.some((t) => /Distribution ledger actuals/i.test(t.title))).toBe(true);
      expect(appendix.tables.some((t) => /illustrative current period — not cash paid/i.test(t.title))).toBe(true);
      expect(appendix.bullets.some((b) => /cash already paid/i.test(b))).toBe(true);
    }
  });

  it("GP narrative uses GP/RCP after waterfall; lender keeps SPE book CFADS", () => {
    const snap = appliedSnap();
    const gpText = buildNarrative(snap, "gp").sections.map((s) => s.body).join(" ");
    expect(gpText).toContain("GP/RCP after waterfall");
    expect(gpText).toContain(formatUsd(snap.gpShareOfDistributableCents));
    expect(audienceCfads(snap, "lender").cents).toBe(snap.cfadsLookThroughCents);
    const lenderText = buildNarrative(snap, "lender").sections.map((s) => s.body).join(" ");
    expect(lenderText).toMatch(/SPE CFADS pool|book pool|Lender coverage uses the SPE book pool/);
  });
});
