import { renderPdfPack, renderPptxPack } from "@rcp/documents";
import {
  CHART_IDS,
  LIVE_DECK_MAX_SLIDES,
  LIVE_KPI_MAX,
  LIVE_KPI_MIN,
  LIVE_VISUAL_MAX,
  PACK_IDS,
  PACK_SPINE,
  buildChartSuite,
  buildPack,
  chartIdsPresent,
  liveSpineKinds,
} from "@rcp/reporting";
import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures/period-snapshot";

describe("pack build smoke", () => {
  it("builds every catalog pack with the executive spine", () => {
    const snap = fixtureSnapshot();
    for (const id of PACK_IDS) {
      const pack = buildPack(snap, id);
      expect(pack.slides[0]?.kind).toBe("cover");
      expect(pack.slides.some((s) => s.kind === "kpis")).toBe(true);
      expect(pack.slides.some((s) => s.kind === "thesis")).toBe(true);
      expect(pack.slides.some((s) => s.kind === "visuals")).toBe(true);
      expect(pack.slides.some((s) => s.kind === "risks")).toBe(true);
      expect(pack.slides.some((s) => s.kind === "appendix")).toBe(true);
      expect(pack.slides.at(-1)?.kind).toBe("appendix");
      expect(pack.filenameBase).toContain(id);
      expect(pack.filenameBase).toContain("SPE-WBG");
      expect(pack.slides.length).toBeGreaterThanOrEqual(5);
      expect(pack.slides.length).toBeLessThanOrEqual(LIVE_DECK_MAX_SLIDES);
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
    const investorLabels = investor.slides
      .filter((s) => s.kind === "kpis")
      .flatMap((s) => (s.kind === "kpis" ? s.kpis.map((k) => k.label) : []));
    const lenderLabels = lender.slides
      .filter((s) => s.kind === "kpis")
      .flatMap((s) => (s.kind === "kpis" ? s.kpis.map((k) => k.label) : []));
    expect(investorLabels).toContain("NOI / unit");
    expect(lenderLabels).toContain("DSCR");
    expect(investorLabels).not.toContain("DSCR");
    expect(lender.meta.charts).toContain("coverage_vs_threshold");
    expect(investor.meta.charts).toContain("portfolio_concentration");
    expect(investor.meta.charts).toContain("t12_status");
    expect(investor.meta.charts).not.toEqual(lender.meta.charts);
    expect(investorKpiSlide && investorKpiSlide.kind === "kpis").toBe(true);
    expect(lenderKpiSlide && lenderKpiSlide.kind === "kpis").toBe(true);
  });

  it("keeps gated LTV language in pack appendix disclosures", () => {
    const pack = buildPack(fixtureSnapshot(), "quarterly_lender");
    const appendix = pack.slides.find((s) => s.kind === "appendix");
    expect(appendix && appendix.kind === "appendix").toBe(true);
    if (appendix && appendix.kind === "appendix") {
      expect(appendix.bullets.some((b) => /LTV gated/i.test(b))).toBe(true);
      expect(appendix.bullets.some((b) => /not a GAAP consolidation|Standalone SPE/i.test(b))).toBe(true);
      expect(appendix.bullets.some((b) => /soft-archived SPEs/i.test(b))).toBe(true);
    }
  });

  it("uses one KPI strip of 3–5 tiles and 2–4 live visuals with a so-what", () => {
    const investor = buildPack(fixtureSnapshot(), "monthly_investor");
    expect(liveSpineKinds(investor.slides)).toEqual(PACK_SPINE);
    const kpi = investor.slides.find((s) => s.kind === "kpis");
    expect(kpi && kpi.kind === "kpis").toBe(true);
    if (kpi && kpi.kind === "kpis") {
      expect(kpi.kpis.length).toBeGreaterThanOrEqual(LIVE_KPI_MIN);
      expect(kpi.kpis.length).toBeLessThanOrEqual(LIVE_KPI_MAX);
    }
    const visuals = investor.slides.filter((s) => s.kind === "visuals").flatMap((s) => (s.kind === "visuals" ? s.visuals : []));
    expect(visuals.length).toBeGreaterThanOrEqual(2);
    expect(visuals.length).toBeLessThanOrEqual(LIVE_VISUAL_MAX);
    for (const visual of visuals) {
      expect(visual.soWhat.trim().length).toBeGreaterThan(12);
    }
    const cover = investor.slides[0];
    expect(cover && cover.kind === "cover" && cover.thesis.length).toBeGreaterThan(10);
    expect(cover && cover.kind === "cover" && cover.proofValue.length).toBeGreaterThan(0);
  });
});
