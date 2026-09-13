import { renderPdfPack, renderPptxPack } from "@rcp/documents";
import {
  CHART_IDS,
  PACK_IDS,
  buildChartSuite,
  buildPack,
  chartIdsPresent,
} from "@rcp/reporting";
import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures/period-snapshot";

describe("pack build smoke", () => {
  it("builds every catalog pack with cover, charts, and narrative", () => {
    const snap = fixtureSnapshot();
    for (const id of PACK_IDS) {
      const pack = buildPack(snap, id);
      expect(pack.slides[0]?.kind).toBe("cover");
      expect(pack.slides.some((s) => s.kind === "chart")).toBe(true);
      expect(pack.slides.some((s) => s.kind === "narrative")).toBe(true);
      expect(pack.slides.some((s) => s.kind === "disclosures")).toBe(true);
      expect(pack.filenameBase).toContain(id);
      expect(pack.filenameBase).toContain("SPE-WBG");
    }
  });

  it("chart suite exposes the required infographic ids", () => {
    const suite = buildChartSuite(fixtureSnapshot());
    const present = chartIdsPresent(suite);
    for (const id of CHART_IDS) {
      expect(present).toContain(id);
    }
    expect(suite.waterfall.footnote).toMatch(/AM fees/);
    expect(suite.waterfall.bars.at(-1)?.label).toBe("BTCF");
  });

  it("renders a PDF and a PPTX buffer", async () => {
    const snap = fixtureSnapshot();
    const pdf = await renderPdfPack(buildPack(snap, "monthly_investor"));
    const pptx = await renderPptxPack(buildPack(snap, "ic_memo"));
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pptx.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(pdf.length).toBeGreaterThan(1_000);
    expect(pptx.length).toBeGreaterThan(1_000);
  });

  it("packs pull the matching audience brief for KPIs and charts", () => {
    const snap = fixtureSnapshot();
    const investor = buildPack(snap, "monthly_investor");
    const lender = buildPack(snap, "quarterly_lender");
    expect(investor.meta.audience).toBe("lp");
    expect(lender.meta.audience).toBe("lender");
    expect(investor.meta.charts).toEqual(investor.narrative.chartIds);
    expect(lender.meta.charts).toEqual(lender.narrative.chartIds);
    expect(investor.meta.charts).not.toEqual(lender.meta.charts);
    expect(investor.narrative.citations.map((c) => c.id)).not.toEqual(lender.narrative.citations.map((c) => c.id));
    const investorKpiSlide = investor.slides.find((s) => s.kind === "kpis");
    const lenderKpiSlide = lender.slides.find((s) => s.kind === "kpis");
    expect(investorKpiSlide && investorKpiSlide.kind === "kpis" ? investorKpiSlide.kpis.map((k) => k.label) : []).toContain(
      "NOI / unit",
    );
    expect(lenderKpiSlide && lenderKpiSlide.kind === "kpis" ? lenderKpiSlide.kpis.map((k) => k.label) : []).toContain("DSCR");
    expect(lender.meta.charts).toContain("coverage_vs_threshold");
    expect(investor.meta.charts).toContain("portfolio_concentration");
    expect(investor.meta.charts).not.toEqual(lender.meta.charts);
  });

  it("keeps gated LTV language in pack disclosures", () => {
    const pack = buildPack(fixtureSnapshot(), "quarterly_lender");
    const disclosures = pack.slides.find((s) => s.kind === "disclosures");
    expect(disclosures && disclosures.kind === "disclosures").toBe(true);
    if (disclosures && disclosures.kind === "disclosures") {
      expect(disclosures.bullets.some((b) => /LTV gated/i.test(b))).toBe(true);
      expect(disclosures.bullets.some((b) => /not a GAAP consolidation|Standalone SPE/i.test(b))).toBe(true);
    }
  });
});
