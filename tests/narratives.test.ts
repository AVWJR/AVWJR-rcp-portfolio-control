import { formatUsd } from "@rcp/ledger";
import {
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
});
