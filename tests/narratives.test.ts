import { formatUsd } from "@rcp/ledger";
import {
  AUDIENCE_BRIEFS,
  AUDIENCES,
  buildAllNarratives,
  buildNarrative,
  icRecommendation,
} from "@rcp/reporting";
import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures/period-snapshot";

describe("narrative generation hooks", () => {
  it("emits all five audience tones from the same snapshot", () => {
    const snap = fixtureSnapshot();
    const bundle = buildAllNarratives(snap);
    for (const audience of AUDIENCES) {
      const narrative = bundle[audience];
      expect(narrative.audience).toBe(audience);
      expect(narrative.period).toBe("2026-08");
      expect(narrative.entityCode).toBe("SPE-WBG");
      expect(narrative.sections.length).toBeGreaterThanOrEqual(3);
      const body = narrative.sections.map((s) => s.body).join(" ");
      expect(body).toContain(formatUsd(snap.noiCents));
      expect(body).toMatch(/USD|\$|%|units|x/);
    }
  });

  it("regenerates when period or entity changes", () => {
    const aug = buildNarrative(fixtureSnapshot({ period: "2026-08", noiCents: 12_000_000n }), "lp");
    const jul = buildNarrative(fixtureSnapshot({ period: "2026-07", noiCents: 1_000n, entityCode: "SPE-CVC", entityName: "Crestview Commons LLC" }), "lp");
    expect(aug.period).toBe("2026-08");
    expect(jul.period).toBe("2026-07");
    expect(aug.sections[0]!.body).not.toBe(jul.sections[0]!.body);
    expect(jul.sections[0]!.body).toContain("SPE-CVC");
    expect(jul.sections[0]!.body).toContain(formatUsd(1_000n));
  });

  it("LP cites CFADS as a distributions proxy and keeps AM below NOI", () => {
    const snap = fixtureSnapshot();
    const lp = buildNarrative(snap, "lp");
    const text = lp.sections.map((s) => s.body).join(" ");
    expect(text).toMatch(/distributions proxy/i);
    expect(text).toContain(formatUsd(snap.cfadsCents));
    expect(text).toMatch(/sit below NOI/);
    expect(text).toMatch(/T12 NOI is incomplete/);
  });

  it("IC recommendation is FIX when DSCR fails", () => {
    const snap = fixtureSnapshot({ dscrPass: false, dscrBps: 9_000, dscrThresholdBps: 12_500 });
    const rec = icRecommendation(snap);
    expect(rec.action).toBe("FIX");
    const ic = buildNarrative(snap, "ic");
    expect(ic.recommendation?.action).toBe("FIX");
    expect(ic.sections.some((s) => s.heading.includes("Go / hold / fix"))).toBe(true);
  });

  it("IC recommendation is GO when coverage and occupancy clear", () => {
    const rec = icRecommendation(fixtureSnapshot());
    expect(rec.action).toBe("GO");
  });

  it("does not invent LTV or delinquency", () => {
    const lender = buildNarrative(fixtureSnapshot(), "lender");
    const text = lender.sections.map((s) => s.body).join(" ");
    expect(text).toMatch(/LTV is not stated|gated/i);
    expect(text).toMatch(/Delinquency is not available/);
    expect(text).not.toMatch(/LTV is \d/);
  });

  it("LP and Lender briefs differ on headings, KPIs, and charts for SPE-WBG 2026-08", () => {
    const snap = fixtureSnapshot();
    const lp = buildNarrative(snap, "lp");
    const lender = buildNarrative(snap, "lender");
    const lpHeadings = lp.sections.map((s) => s.heading);
    const lenderHeadings = lender.sections.map((s) => s.heading);

    expect(lp.period).toBe("2026-08");
    expect(lender.entityCode).toBe("SPE-WBG");
    expect(lpHeadings).toEqual(AUDIENCE_BRIEFS.lp.sectionHeadings);
    expect(lenderHeadings).toEqual(AUDIENCE_BRIEFS.lender.sectionHeadings);
    expect(lpHeadings).not.toEqual(lenderHeadings);
    expect(lpHeadings.join(" ")).toMatch(/NOI per unit|distributions proxy/i);
    expect(lenderHeadings.join(" ")).toMatch(/DSCR|debt yield|UPB|covenant/i);
    expect(lpHeadings.join(" ")).not.toMatch(/covenant watch|debt yield versus threshold/i);
    expect(lenderHeadings.join(" ")).not.toMatch(/distributions proxy|IRR/i);

    const lpKpis = lp.citations.map((c) => c.id);
    const lenderKpis = lender.citations.map((c) => c.id);
    expect(lpKpis).toEqual(AUDIENCE_BRIEFS.lp.kpiIds);
    expect(lenderKpis).toEqual(AUDIENCE_BRIEFS.lender.kpiIds);
    expect(lpKpis).toContain("look_through_noi");
    expect(lpKpis).toContain("noi_per_unit");
    expect(lpKpis).toContain("occupancy");
    expect(lpKpis).not.toContain("debt_service");
    expect(lenderKpis).toContain("dscr");
    expect(lenderKpis).toContain("debt_yield");
    expect(lenderKpis).toContain("debt_service");
    expect(lenderKpis).not.toContain("look_through_noi");

    expect(lp.chartIds).toEqual(AUDIENCE_BRIEFS.lp.chartIds);
    expect(lender.chartIds).toEqual(AUDIENCE_BRIEFS.lender.chartIds);
    expect(lp.chartIds).toContain("portfolio_concentration");
    expect(lp.chartIds).toContain("occupancy_breakeven");
    expect(lp.chartIds).not.toContain("debt_maturity_wall");
    expect(lender.chartIds).toContain("coverage_vs_threshold");
    expect(lender.chartIds).toContain("debt_maturity_wall");
    expect(lender.chartIds).not.toContain("portfolio_concentration");

    const lpBody = lp.sections.map((s) => s.body).join(" ");
    const lenderBody = lender.sections.map((s) => s.body).join(" ");
    expect(lpBody).not.toBe(lenderBody);
    expect(lpBody).toMatch(/distributions proxy/i);
    expect(lenderBody).toMatch(/credit memo|debt service/i);
    expect(lenderBody).not.toMatch(/promote waterfall|IRR/);
  });
});
