export type VariancePair = {
  actual: bigint | null;
  budget: bigint | null;
  prior: bigint | null;
  variance: bigint | null;
  varianceBps: number | null;
  mom: bigint | null;
  momBps: number | null;
};

export function centsVarianceBps(actual: bigint, base: bigint): number | null {
  if (base === 0n) return null;
  return Number((actual - base) * 10_000n / base);
}

export function pairVariance(actual: bigint | null, budget: bigint | null, prior: bigint | null): VariancePair {
  const variance = actual !== null && budget !== null ? actual - budget : null;
  const varianceBps =
    actual !== null && budget !== null && budget !== 0n ? Number((variance! * 10_000n) / budget) : null;
  const mom = actual !== null && prior !== null ? actual - prior : null;
  const momBps =
    actual !== null && prior !== null && prior !== 0n ? Number((mom! * 10_000n) / prior) : null;
  return { actual, budget, prior, variance, varianceBps, mom, momBps };
}

export function formatRatioBps(bps: number | null, locale = "en-US"): string {
  if (bps === null) return "—";
  const value = bps / 100;
  const formatted = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value < 0) return `(${formatted}%)`;
  return `${formatted}%`;
}
