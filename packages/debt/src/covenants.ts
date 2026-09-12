import type { CovenantResult } from "./types";

/**
 * DSCR = period NOI / period debt service (interest + principal).
 * Debt yield = annualized NOI / UPB. Both stored and compared in basis points.
 * Monthly NOI is annualized × 12. Do not substitute book cost for value (no fake LTV).
 */
export function computeCovenants(opts: {
  noiCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
  upbCents: bigint;
  dscrThresholdBps: number;
  debtYieldThresholdBps: number;
  periodsInYear?: number;
}): CovenantResult {
  const debtServiceCents = opts.interestCents + opts.principalCents;
  const periods = BigInt(opts.periodsInYear ?? 12);
  const annualizedNoiCents = opts.noiCents * periods;

  let dscrBps: number | null = null;
  if (debtServiceCents > 0n) {
    dscrBps = Number((opts.noiCents * 10_000n) / debtServiceCents);
  }

  let debtYieldBps: number | null = null;
  if (opts.upbCents > 0n) {
    debtYieldBps = Number((annualizedNoiCents * 10_000n) / opts.upbCents);
  }

  return {
    dscrBps,
    dscrThresholdBps: opts.dscrThresholdBps,
    dscrPass: dscrBps === null ? null : dscrBps >= opts.dscrThresholdBps,
    debtYieldBps,
    debtYieldThresholdBps: opts.debtYieldThresholdBps,
    debtYieldPass: debtYieldBps === null ? null : debtYieldBps >= opts.debtYieldThresholdBps,
    noiCents: opts.noiCents,
    debtServiceCents,
    upbCents: opts.upbCents,
    annualizedNoiCents,
  };
}

export function formatMultipleBps(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 10_000).toFixed(2)}x`;
}

export function formatPercentBps(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}
