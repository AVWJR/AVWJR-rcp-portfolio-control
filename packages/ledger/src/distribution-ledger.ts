/**
 * Permanent deal-level distribution ledger.
 *
 * Each posting runs the saved SpeWaterfall once. Preferred return accrues for
 * the months since the prior posting (one month on the first posting). Return
 * of capital is paid before pref, matching the waterfall engine. Posted rows
 * are not edited; a reversal drops the latest posting and restores the prior
 * running totals.
 *
 * Integer USD cents.
 */

import {
  type WaterfallConfig,
  type WaterfallRunResult,
  type WaterfallTierKind,
  catchUpGrossCents,
  residualPromoteSplit,
  resolveUnpaidPrefCents,
  resolveUnreturnedCapitalCents,
  runWaterfall,
} from "./waterfall";

export const DISTRIBUTION_SOURCES = ["OPERATING_CASH", "CAPITAL_EVENT"] as const;
export type DistributionSource = (typeof DISTRIBUTION_SOURCES)[number];

export const WATERFALL_POSITIONS = ["ROC", "PREF", "CATCH_UP", "PROMOTE"] as const;
export type WaterfallPosition = (typeof WATERFALL_POSITIONS)[number];

export type PartyCents = {
  lpCents: bigint;
  rcpCents: bigint;
  coGpCents: bigint;
};

export type TierPartyTotals = {
  roc: PartyCents;
  pref: PartyCents;
  catchUp: PartyCents;
  promote: PartyCents;
};

export type DistributionRunningTotals = {
  capitalContributedCents: bigint;
  capitalReturnedCents: bigint;
  unreturnedCapitalCents: bigint;
  prefAccruedCents: bigint;
  prefPaidCents: bigint;
  prefUnpaidCents: bigint;
  catchUpPaidCents: bigint;
  catchUpTargetCents: bigint;
  promoteEarnedCents: bigint;
  cumulativeLpCents: bigint;
  cumulativeRcpCents: bigint;
  cumulativeCoGpCents: bigint;
  byTier: TierPartyTotals;
};

export type DistributionLine = {
  tierKind: WaterfallTierKind;
  tierLabel: string;
  lpCents: bigint;
  rcpCents: bigint;
  coGpCents: bigint;
};

export type AppliedDistribution = {
  year: number;
  month: number;
  periodLabel: string;
  grossCents: bigint;
  source: DistributionSource;
  monthsAccrued: number;
  lines: DistributionLine[];
  state: DistributionRunningTotals;
  run: WaterfallRunResult;
};

export type DistributionLedgerSeed = {
  config: WaterfallConfig;
  lpContributedCents: bigint;
  /** Null uses contributed capital. A typed 0 stays 0. */
  openingUnreturnedCents: bigint | null;
  /** Null means no pref carried in. A typed 0 stays 0. */
  openingUnpaidPrefCents: bigint | null;
  europeanPromoteOpen?: boolean;
};

export type DistributionPosting = {
  year: number;
  month: number;
  grossCents: bigint;
  source: DistributionSource;
};

const ZERO_PARTY: PartyCents = { lpCents: 0n, rcpCents: 0n, coGpCents: 0n };

function party(): PartyCents {
  return { ...ZERO_PARTY };
}

function emptyTiers(): TierPartyTotals {
  return { roc: party(), pref: party(), catchUp: party(), promote: party() };
}

function addParty(into: PartyCents, line: PartyCents): void {
  into.lpCents += line.lpCents;
  into.rcpCents += line.rcpCents;
  into.coGpCents += line.coGpCents;
}

export function isDistributionSource(value: string): value is DistributionSource {
  return (DISTRIBUTION_SOURCES as readonly string[]).includes(value);
}

export function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Months of pref to accrue. First posting accrues one month. A same-month posting accrues none. */
export function accrualMonths(prev: { year: number; month: number } | null, next: { year: number; month: number }): number {
  if (!prev) return 1;
  const diff = (next.year - prev.year) * 12 + (next.month - prev.month);
  return diff > 0 ? diff : 0;
}

export function catchUpTargetCents(config: WaterfallConfig, lpPrefPaidCents: bigint): bigint {
  if (!config.catchUpEnabled) return 0n;
  const residual = residualPromoteSplit(config.tiers);
  if (!residual || residual.lpSplitBps <= 0 || residual.gpSplitBps <= 0) return 0n;
  const pref = lpPrefPaidCents > 0n ? lpPrefPaidCents : 0n;
  const lpBps = residual.lpSplitBps;
  const gpBps = residual.gpSplitBps;
  const total = lpBps + gpBps;
  const rate = Math.min(10_000, Math.max(0, Math.round(config.catchUpBps)));
  // The engine pays no catch-up when c ≤ g, including a 0% catch-up that is still enabled.
  // Falling through to P·g/l would invent a target the waterfall never pays.
  if (rate <= 0 || total <= 0) return 0n;
  if (rate < 10_000) {
    const denom = BigInt(rate) * BigInt(total) - BigInt(gpBps) * 10_000n;
    if (denom <= 0n) return 0n;
    // Below 100%, the GP only receives c of each catch-up dollar, so the target is c·g·P/(c−g).
    return (BigInt(rate) * BigInt(gpBps) * pref) / denom;
  }
  // 100% catch-up: GP target is P·g/l.
  return (pref * BigInt(gpBps)) / BigInt(lpBps);
}

/**
 * GP cents the next catch-up dollar would still pay. The engine floors each cent,
 * so a stored target can sit 1¢ above what will ever be paid.
 */
function catchUpGpStillDueCents(state: DistributionRunningTotals, config: WaterfallConfig): bigint {
  if (!config.catchUpEnabled) return 0n;
  const residual = residualPromoteSplit(config.tiers);
  if (!residual || residual.gpSplitBps <= 0) return 0n;
  const rate = Math.min(10_000, Math.max(0, Math.round(config.catchUpBps)));
  if (rate <= 0) return 0n;
  const catchUp = state.byTier.catchUp;
  const promote = state.byTier.promote;
  // G0 is GP catch-up plus GP promote already earned. Once promote has been paid,
  // a leftover cent in the catch-up formula is rounding, not another catch-up tier.
  const gross = catchUpGrossCents({
    lpPrefPaidCents: state.byTier.pref.lpCents,
    gpPromoteSoFarCents: catchUp.rcpCents + catchUp.coGpCents + promote.rcpCents + promote.coGpCents,
    priorCatchUpGrossCents: catchUp.lpCents + catchUp.rcpCents + catchUp.coGpCents,
    lpSplitBps: residual.lpSplitBps,
    gpSplitBps: residual.gpSplitBps,
    catchUpBps: rate,
  });
  return (gross * BigInt(rate)) / 10_000n;
}

export function lpDpiBps(lpDistributedCents: bigint, contributedCents: bigint): number | null {
  if (contributedCents <= 0n) return null;
  const paid = lpDistributedCents > 0n ? lpDistributedCents : 0n;
  return Number((paid * 10_000n) / contributedCents);
}

/** Capital already back is contributed minus what is still out. The gap above ledger ROC was returned before this ledger. */
export function capitalBackCents(
  contributedCents: bigint,
  unreturnedCents: bigint,
  ledgerReturnedCents: bigint,
): { returnedCents: bigint; beforeLedgerCents: bigint } {
  const contributed = contributedCents > 0n ? contributedCents : 0n;
  const stillOut = unreturnedCents > 0n ? unreturnedCents : 0n;
  const returned = contributed > stillOut ? contributed - stillOut : 0n;
  const ledger = ledgerReturnedCents > 0n ? ledgerReturnedCents : 0n;
  return { returnedCents: returned, beforeLedgerCents: returned > ledger ? returned - ledger : 0n };
}

export function waterfallPosition(state: DistributionRunningTotals, config: WaterfallConfig): WaterfallPosition {
  if (state.unreturnedCapitalCents > 0n) return "ROC";
  if (state.prefUnpaidCents > 0n) return "PREF";
  // Stay in catch-up only while the engine would still pay the GP at least 1¢.
  if (catchUpGpStillDueCents(state, config) >= 1n) return "CATCH_UP";
  return "PROMOTE";
}

export function openingDistributionState(seed: DistributionLedgerSeed): DistributionRunningTotals {
  const contributed = seed.lpContributedCents > 0n ? seed.lpContributedCents : 0n;
  return {
    capitalContributedCents: contributed,
    capitalReturnedCents: 0n,
    unreturnedCapitalCents: resolveUnreturnedCapitalCents(seed.openingUnreturnedCents, contributed),
    prefAccruedCents: 0n,
    prefPaidCents: 0n,
    prefUnpaidCents: resolveUnpaidPrefCents(seed.openingUnpaidPrefCents),
    catchUpPaidCents: 0n,
    catchUpTargetCents: 0n,
    promoteEarnedCents: 0n,
    cumulativeLpCents: 0n,
    cumulativeRcpCents: 0n,
    cumulativeCoGpCents: 0n,
    byTier: emptyTiers(),
  };
}

function cloneState(state: DistributionRunningTotals): DistributionRunningTotals {
  return {
    ...state,
    byTier: {
      roc: { ...state.byTier.roc },
      pref: { ...state.byTier.pref },
      catchUp: { ...state.byTier.catchUp },
      promote: { ...state.byTier.promote },
    },
  };
}

export function applyDistribution(
  seed: DistributionLedgerSeed,
  prior: DistributionRunningTotals,
  priorPeriod: { year: number; month: number } | null,
  posting: DistributionPosting,
): AppliedDistribution {
  if (!isDistributionSource(posting.source)) {
    throw new Error("Distribution source must be operating cash or a capital event.");
  }
  if (posting.grossCents <= 0n) {
    throw new Error("Distribution amount must be greater than zero.");
  }
  if (posting.month < 1 || posting.month > 12 || posting.year < 1900) {
    throw new Error("Distribution period is not a calendar month.");
  }
  const months = accrualMonths(priorPeriod, posting);
  const run = runWaterfall({
    config: seed.config,
    distributableCents: posting.grossCents,
    lpContributedCents: prior.capitalContributedCents,
    unreturnedCapitalCents: prior.unreturnedCapitalCents,
    unpaidPrefCents: prior.prefUnpaidCents,
    prefPaidToDateCents: prior.prefPaidCents,
    periodMonths: months,
    europeanPromoteOpen: seed.europeanPromoteOpen,
    priorLpPrefPaidCents: prior.byTier.pref.lpCents,
    priorCatchUpGpCents: prior.byTier.catchUp.rcpCents + prior.byTier.catchUp.coGpCents,
    priorCatchUpGrossCents:
      prior.byTier.catchUp.lpCents + prior.byTier.catchUp.rcpCents + prior.byTier.catchUp.coGpCents,
  });
  const byTier = {
    roc: { ...prior.byTier.roc },
    pref: { ...prior.byTier.pref },
    catchUp: { ...prior.byTier.catchUp },
    promote: { ...prior.byTier.promote },
  };
  const lines: DistributionLine[] = run.steps
    .filter((step) => step.takenCents > 0n || step.kind === "CATCH_UP")
    .map((step) => ({
      tierKind: step.kind,
      tierLabel: step.label,
      lpCents: step.lpCents,
      rcpCents: step.rcpCents,
      coGpCents: step.coGpCents,
    }));
  for (const line of lines) {
    if (line.tierKind === "ROC") addParty(byTier.roc, line);
    else if (line.tierKind === "PREF") addParty(byTier.pref, line);
    else if (line.tierKind === "CATCH_UP") addParty(byTier.catchUp, line);
    else addParty(byTier.promote, line);
  }
  const returnedNow = byTier.roc.lpCents + byTier.roc.rcpCents + byTier.roc.coGpCents - (prior.byTier.roc.lpCents + prior.byTier.roc.rcpCents + prior.byTier.roc.coGpCents);
  const prefPaidNow = byTier.pref.lpCents + byTier.pref.rcpCents + byTier.pref.coGpCents - (prior.byTier.pref.lpCents + prior.byTier.pref.rcpCents + prior.byTier.pref.coGpCents);
  const catchPaidNow =
    byTier.catchUp.rcpCents +
    byTier.catchUp.coGpCents -
    (prior.byTier.catchUp.rcpCents + prior.byTier.catchUp.coGpCents);
  const promoteNow = byTier.promote.rcpCents + byTier.promote.coGpCents - (prior.byTier.promote.rcpCents + prior.byTier.promote.coGpCents);
  const state: DistributionRunningTotals = {
    capitalContributedCents: prior.capitalContributedCents,
    capitalReturnedCents: prior.capitalReturnedCents + (returnedNow > 0n ? returnedNow : 0n),
    unreturnedCapitalCents: run.unreturnedCapitalAfterCents,
    prefAccruedCents: prior.prefAccruedCents + run.prefAccruedThisRunCents,
    prefPaidCents: prior.prefPaidCents + (prefPaidNow > 0n ? prefPaidNow : 0n),
    prefUnpaidCents: run.unpaidPrefAfterCents,
    catchUpPaidCents: prior.catchUpPaidCents + (catchPaidNow > 0n ? catchPaidNow : 0n),
    catchUpTargetCents: catchUpTargetCents(seed.config, byTier.pref.lpCents),
    promoteEarnedCents: prior.promoteEarnedCents + (promoteNow > 0n ? promoteNow : 0n),
    cumulativeLpCents: prior.cumulativeLpCents + run.lpCents,
    cumulativeRcpCents: prior.cumulativeRcpCents + run.rcpCents,
    cumulativeCoGpCents: prior.cumulativeCoGpCents + run.coGpCents,
    byTier,
  };
  return {
    year: posting.year,
    month: posting.month,
    periodLabel: periodLabel(posting.year, posting.month),
    grossCents: posting.grossCents,
    source: posting.source,
    monthsAccrued: months,
    lines,
    state,
    run,
  };
}

export function runDistributionSequence(
  seed: DistributionLedgerSeed,
  postings: DistributionPosting[],
): { opening: DistributionRunningTotals; events: AppliedDistribution[] } {
  const opening = openingDistributionState(seed);
  const events: AppliedDistribution[] = [];
  let prior = opening;
  let priorPeriod: { year: number; month: number } | null = null;
  for (const posting of postings) {
    const applied = applyDistribution(seed, prior, priorPeriod, posting);
    events.push(applied);
    prior = applied.state;
    priorPeriod = { year: posting.year, month: posting.month };
  }
  return { opening, events };
}

/** Dropping the latest posting restores the running totals from before it. */
export function stateBeforeLastPosting(
  opening: DistributionRunningTotals,
  events: AppliedDistribution[],
): DistributionRunningTotals {
  if (events.length <= 1) return cloneState(opening);
  return cloneState(events[events.length - 2]!.state);
}

export function negateLines(lines: DistributionLine[]): DistributionLine[] {
  return lines.map((line) => ({
    ...line,
    lpCents: -line.lpCents,
    rcpCents: -line.rcpCents,
    coGpCents: -line.coGpCents,
  }));
}
