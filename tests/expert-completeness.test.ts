import { getAnomalies, getDataCompleteness, getEntitySummary } from "@/lib/expert/tools";
import { describe, expect, it } from "vitest";

function isToolError(value: unknown): value is { ok: false; error: string } {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === false);
}

describe("expert completeness / anomalies on seed", () => {
  it("scores SPE-WBG / 2026-08 from live books", async () => {
    const summary = await getEntitySummary("SPE-WBG");
    if (isToolError(summary)) {
      throw new Error("Seed SPE-WBG before running this test (npm run db:reset)");
    }

    const completeness = await getDataCompleteness("SPE-WBG", "2026-08");
    if (isToolError(completeness)) {
      throw new Error(completeness.error);
    }
    expect(completeness.entityCode).toBe("SPE-WBG");
    expect(completeness.periodLabel).toBe("2026-08");
    expect(completeness.score).toBeGreaterThanOrEqual(0);
    expect(completeness.score).toBeLessThanOrEqual(100);
    expect(completeness.items.length).toBeGreaterThan(4);

    const rent = completeness.items.find((item) => item.id === "rent_roll");
    const budget = completeness.items.find((item) => item.id === "budget");
    const loan = completeness.items.find((item) => item.id === "loan");
    expect(rent?.status).toBe("ready");
    expect(budget?.status).toBe("ready");
    expect(loan?.status).toBe("ready");
  });

  it("returns real anomaly signals for SPE-WBG / 2026-08", async () => {
    const anomalies = await getAnomalies("SPE-WBG", "2026-08");
    if (isToolError(anomalies)) {
      throw new Error(anomalies.error);
    }
    expect(anomalies.flags.length).toBeGreaterThan(0);
    expect(anomalies.flags.some((flag) => flag.id === "t12_incomplete" || flag.id === "ltv_gated")).toBe(true);
    for (const flag of anomalies.flags) {
      expect(flag.href.startsWith("/")).toBe(true);
      expect(flag.source.length).toBeGreaterThan(3);
    }
  });
});
