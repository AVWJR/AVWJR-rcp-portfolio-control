import { formatUsd } from "@rcp/ledger";
import {
  AUDIENCE_BRIEFS,
  AUDIENCES,
  buildAllNarratives,
  buildNarrative,
  icRecommendation,
  sharedAudienceKpiIds,
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
      expect(narrative.sections.map((s) => s.heading)).toEqual(AUDIENCE_BRIEFS[audience].sectionHeadings);
      expect(narrative.seedDisclaimer).toMatch(/T12 is incomplete|Seed \/ demo/);
      const body = narrative.sections.map((s) => s.body).join(" ");
      expect(body).toContain(formatUsd(snap.noiCents));
      expect(body).toMatch(/USD|\$|%|units|x/);
    }
    const headings = AUDIENCES.map((a) => bundle[a].sections.map((s) => s.heading).join("|"));
    expect(new Set(headings).size).toBe(5);
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
    expect(lp.sections[2]!.heading).toBe("Ask / next capital event");
  });

  it("IC recommendation is KILL when DSCR fails", () => {
    const snap = fixtureSnapshot({ dscrPass: false, dscrBps: 9_000, dscrThresholdBps: 12_500 });
    const rec = icRecommendation(snap);
    expect(rec.action).toBe("KILL");
    const ic = buildNarrative(snap, "ic");
    expect(ic.recommendation?.action).toBe("KILL");
    expect(ic.sections.some((s) => s.heading.includes("Go / hold / kill"))).toBe(true);
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

  it("labels every NOI tile with a noiDefinition", () => {
    const lp = buildNarrative(fixtureSnapshot(), "lp");
    const noiTiles = lp.citations.filter((c) =>
      ["noi", "look_through_noi", "noi_per_unit", "budget_variance"].includes(c.id),
    );
    expect(noiTiles.length).toBeGreaterThan(0);
    for (const tile of noiTiles) {
      expect(tile.noiDefinition).toMatch(/^(period|t12 incomplete|annualized_period)$/);
    }
    const ic = buildNarrative(fixtureSnapshot(), "ic");
    expect(ic.citations.find((c) => c.id === "annualized_noi")?.noiDefinition).toBe("annualized_period");
    expect(ic.citations.find((c) => c.id === "t12_status")?.noiDefinition).toBe("t12 incomplete");
  });

  it("shared KPI strip only includes ids on 3+ audiences", () => {
    const shared = sharedAudienceKpiIds();
    expect(shared.length).toBeGreaterThan(0);
    for (const id of shared) {
      const n = AUDIENCES.filter((a) => AUDIENCE_BRIEFS[a].kpiIds.includes(id)).length;
      expect(n).toBeGreaterThanOrEqual(3);
    }
    expect(shared).not.toContain("dscr");
    expect(shared).not.toContain("look_through_noi");
    const lp = buildNarrative(fixtureSnapshot(), "lp");
    expect(lp.sharedCitations.every((c) => shared.includes(c.id as (typeof shared)[number]))).toBe(true);
    expect(lp.specificCitations.some((c) => c.id === "look_through_noi")).toBe(true);
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
    expect(lpHeadings.join(" ")).toMatch(/NOI \/ NOI-unit|Capital at risk|Ask \/ next capital/i);
    expect(lenderHeadings.join(" ")).toMatch(/In covenant|Cure path|Collateral/i);
    expect(lpHeadings.join(" ")).not.toMatch(/In covenant|Cure path/i);
    expect(lenderHeadings.join(" ")).not.toMatch(/Ask \/ next capital|NOI-unit versus plan/i);

    const lpKpis = lp.citations.map((c) => c.id);
    const lenderKpis = lender.citations.map((c) => c.id);
    expect(lpKpis).toEqual(AUDIENCE_BRIEFS.lp.kpiIds);
    expect(lenderKpis).toEqual(AUDIENCE_BRIEFS.lender.kpiIds);
    expect(lpKpis).toContain("look_through_noi");
    expect(lpKpis).toContain("noi_per_unit");
    expect(lpKpis).toContain("occupancy");
    expect(lpKpis).not.toContain("dscr");
    expect(lenderKpis).toContain("dscr");
    expect(lenderKpis).toContain("debt_yield");
    expect(lenderKpis).toContain("cfads_dscr");
    expect(lenderKpis).not.toContain("look_through_noi");

    expect(lp.chartIds).toEqual(AUDIENCE_BRIEFS.lp.chartIds);
    expect(lender.chartIds).toEqual(AUDIENCE_BRIEFS.lender.chartIds);
    expect(lp.chartIds).toContain("portfolio_concentration");
    expect(lp.chartIds).toContain("occupancy_breakeven");
    expect(lp.chartIds).toContain("t12_status");
    expect(lp.chartIds).toContain("covenant_watchlist");
    expect(lp.chartIds).not.toContain("debt_maturity_wall");
    expect(lender.chartIds).toContain("coverage_vs_threshold");
    expect(lender.chartIds).toContain("debt_maturity_wall");
    expect(lender.chartIds).not.toContain("portfolio_concentration");
    expect(lender.chartIds).not.toContain("t12_status");

    const lpBody = lp.sections.map((s) => s.body).join(" ");
    const lenderBody = lender.sections.map((s) => s.body).join(" ");
    expect(lpBody).not.toBe(lenderBody);
    expect(lpBody).toMatch(/distributions proxy|next capital event/i);
    expect(lenderBody).toMatch(/credit memo|In covenant|debt service/i);
    expect(lenderBody).not.toMatch(/promote waterfall|IRR/);
    expect(lp.specificCitations.map((c) => c.id)).not.toEqual(lender.specificCitations.map((c) => c.id));
  });
});
