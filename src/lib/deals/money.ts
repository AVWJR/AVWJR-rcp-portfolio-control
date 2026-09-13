export function dollarsToCents(input: string | number | null | undefined): bigint | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Enter a non-negative USD amount (for example 12,500,000.00).");
  }
  return BigInt(Math.round(n * 100));
}

/** 5.68% annual rate → 568 interestRateBps */
export function percentToRateBps(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Enter a non-negative annual rate percent (for example 5.68).");
  }
  return Math.round(n * 100);
}

/** 8.00% debt yield → 800 debtYieldThresholdBps */
export function percentToYieldBps(input: string | number | null | undefined): number | null {
  return percentToRateBps(input);
}

/** 1.25x DSCR → 12500 dscrThresholdBps */
export function multipleToDscrBps(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(/x$/i, "").trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Enter a DSCR multiple (for example 1.25).");
  }
  return Math.round(n * 10_000);
}
