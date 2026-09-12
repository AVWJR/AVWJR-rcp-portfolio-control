import { computeCovenants, formatMultipleBps, formatPercentBps } from "@rcp/debt";
import { dollars } from "@rcp/ledger";
import { describe, expect, it } from "vitest";

describe("debt covenants", () => {
  it("computes DSCR and annualized debt yield in basis points", () => {
    const result = computeCovenants({
      noiCents: dollars(116_740),
      interestCents: dollars(80_500),
      principalCents: dollars(20_000),
      upbCents: dollars(16_980_000),
      dscrThresholdBps: 12_500,
      debtYieldThresholdBps: 800,
    });
    expect(result.debtServiceCents).toBe(dollars(100_500));
    expect(result.dscrBps).toBe(Number((dollars(116_740) * 10_000n) / dollars(100_500)));
    expect(result.dscrPass).toBe(false);
    expect(result.debtYieldBps).toBe(Number((dollars(116_740) * 12n * 10_000n) / dollars(16_980_000)));
    expect(result.annualizedNoiCents).toBe(dollars(116_740) * 12n);
  });

  it("formats multiples and percents", () => {
    expect(formatMultipleBps(12_500)).toBe("1.25x");
    expect(formatPercentBps(824)).toBe("8.24%");
  });
});
