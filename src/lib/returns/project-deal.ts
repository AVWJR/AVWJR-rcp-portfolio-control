import {
  CASH_SHORTFALL_NOTE,
  FEE_ACCRUED_UNPAID_NOTE,
  FEE_EXCEEDS_CASH_NOTE,
  FEE_UNPAID_AT_EXIT_NOTE,
  growCents,
  isLookThroughTemplate,
  runDealProforma,
  type WaterfallConfig,
} from "@rcp/ledger";
import { IRR_NOT_AVAILABLE, rateToBps, solveIrr, type IrrCashFlow } from "./irr";
import { resolveAnnualFee, type FeeInputs } from "./fees";

export const EXIT_VALUE_NEEDED = "exit value needed";
export const LOAN_EXCEEDS_EXIT_NOTE = "loan exceeds exit value, no sale proceeds";
export const DEBT_SERVICE_NEEDED = "debt service needed";
export const RETURNS_BASIS = "after debt service and fees";

const CASH_NOTES = new Set<string>([
  CASH_SHORTFALL_NOTE,
  FEE_EXCEEDS_CASH_NOTE,
  FEE_ACCRUED_UNPAID_NOTE,
  FEE_UNPAID_AT_EXIT_NOTE,
  LOAN_EXCEEDS_EXIT_NOTE,
]);

export function exitValueNeededFor(count: number): string {
  return count === 1 ? "exit value needed for 1 deal" : `exit value needed for ${count} deals`;
}

/** Cash, fee, and loan notes that belong on a deal row. IRR gap phrases stay on the IRR cell. */
export function dealCashNotes(notes: string[]): string[] {
  return notes.filter((note) => CASH_NOTES.has(note));
}

/**
 * LP and RCP returns as a thin layer on runDealProforma.
 * The waterfall split stays in the ledger engine.
 * Sale proceeds stay in IRR and stay out of cash yield.
 */

export type DealReturnInput = FeeInputs & {
  config: WaterfallConfig;
  lpContributedCents: bigint;
  unreturnedCapitalCents: bigint | null;
  unpaidPrefCents: bigint | null;
  prefPaidToDateCents: bigint;
  year1CfadsCents: bigint;
  holdYears: number;
  growthBps: number;
  exitEquityProceedsCents: bigint;
  europeanPromoteOpen?: boolean;
  equityRequiredCents: bigint | null;
  /** null means the payment is not on file. 0 means the deal has no debt service. */
  annualDebtServiceCents: bigint | null;
  /** Exit-year NOI before debt, used only when an exit cap rate is typed. */
  year1NoiCents?: bigint;
  upbCents?: bigint;
  exitCapRateBps?: number | null;
};

export type DealReturnMetrics = {
  gap: string | null;
  feeAnnualCents: bigint | null;
  holdYears: number;
  lpEquityCents: bigint;
  rcpEquityCents: bigint;
  lpNetIrrBps: number | null;
  lpIrrNote: string | null;
  lpYear1CashYieldBps: number | null;
  lpAvgCashYieldBps: number | null;
  rcpIrrBps: number | null;
  rcpIrrNote: string | null;
  rcpEquityMultipleNote: string | null;
  rcpYear1CashOnCashBps: number | null;
  rcpAvgCashOnCashBps: number | null;
  rcpEquityMultipleBps: number | null;
  /** True only when no exit was entered, or NOI cannot value the property. */
  exitGap: boolean;
  /** Exit equity passed into the waterfall. Zero when the loan consumes the sale. */
  exitEquityProceedsCents: bigint;
  /** Fee still unpaid after the exit-year sale attempt. */
  feeAccruedUnpaidCents: bigint;
  years: {
    year: number;
    lpCents: bigint;
    lpOperatingCents: bigint;
    rcpCents: bigint;
    rcpOperatingCents: bigint;
    /** Fee paid from operating cash after debt service. Sale payoff is not included. */
    feePaidCents: bigint;
  }[];
  notes: string[];
};

export function exitEquityFromCap(opts: {
  exitCapRateBps: number | null | undefined;
  year1NoiCents: bigint;
  growthBps: number;
  holdYears: number;
  upbCents: bigint;
}): { proceedsCents: bigint; exitGap: boolean; note: string | null } {
  if (opts.exitCapRateBps == null || opts.exitCapRateBps <= 0 || opts.year1NoiCents <= 0n) {
    return { proceedsCents: 0n, exitGap: true, note: EXIT_VALUE_NEEDED };
  }
  const exitNoi = growCents(opts.year1NoiCents, opts.growthBps, Math.max(0, opts.holdYears - 1));
  if (exitNoi <= 0n) return { proceedsCents: 0n, exitGap: true, note: EXIT_VALUE_NEEDED };
  const gross = (exitNoi * 10_000n) / BigInt(opts.exitCapRateBps);
  const debt = opts.upbCents > 0n ? opts.upbCents : 0n;
  const equity = gross - debt;
  if (equity <= 0n) return { proceedsCents: 0n, exitGap: false, note: LOAN_EXCEEDS_EXIT_NOTE };
  return { proceedsCents: equity, exitGap: false, note: null };
}

/** Snapshot equity when it is on file, otherwise LP equity grossed up for GP co-invest. */
export function resolveEquityRequiredCents(opts: {
  lpContributedCents: bigint;
  gpCoInvestBps: number;
  snapshotCents?: bigint | null;
}): bigint | null {
  if (opts.snapshotCents != null && opts.snapshotCents > 0n) return opts.snapshotCents;
  const lp = opts.lpContributedCents > 0n ? opts.lpContributedCents : 0n;
  if (lp <= 0n || opts.gpCoInvestBps >= 10_000 || opts.gpCoInvestBps < 0) return null;
  return (lp * 10_000n) / BigInt(10_000 - opts.gpCoInvestBps);
}

export function rcpEquityCents(opts: {
  lpContributedCents: bigint;
  gpCoInvestBps: number;
  equityRequiredCents: bigint | null;
  lookThrough: boolean;
}): bigint {
  const lp = opts.lpContributedCents > 0n ? opts.lpContributedCents : 0n;
  if (opts.lookThrough) {
    if (opts.equityRequiredCents != null && opts.equityRequiredCents > 0n) return opts.equityRequiredCents;
    return lp;
  }
  if (opts.equityRequiredCents != null && opts.equityRequiredCents > lp) return opts.equityRequiredCents - lp;
  const bps = opts.gpCoInvestBps;
  if (bps <= 0 || bps >= 10_000 || lp <= 0n) return 0n;
  return (lp * BigInt(bps)) / BigInt(10_000 - bps);
}

function yieldBps(cash: bigint, equity: bigint): number | null {
  if (equity <= 0n) return null;
  return Number((cash * 10_000n) / equity);
}

function emptyMetrics(gap: string, notes: string[] = []): DealReturnMetrics {
  return {
    gap,
    feeAnnualCents: null,
    holdYears: 0,
    lpEquityCents: 0n,
    rcpEquityCents: 0n,
    lpNetIrrBps: null,
    lpIrrNote: null,
    lpYear1CashYieldBps: null,
    lpAvgCashYieldBps: null,
    rcpIrrBps: null,
    rcpIrrNote: null,
    rcpEquityMultipleNote: null,
    rcpYear1CashOnCashBps: null,
    rcpAvgCashOnCashBps: null,
    rcpEquityMultipleBps: null,
    exitGap: false,
    exitEquityProceedsCents: 0n,
    feeAccruedUnpaidCents: 0n,
    years: [],
    notes,
  };
}

export function projectDealReturns(input: DealReturnInput): DealReturnMetrics {
  const fee = resolveAnnualFee(input);
  if (!fee.ok) return emptyMetrics(fee.gap);
  if (input.annualDebtServiceCents == null) return emptyMetrics(DEBT_SERVICE_NEEDED);
  const annualDebt = input.annualDebtServiceCents > 0n ? input.annualDebtServiceCents : 0n;

  const explicitExit = input.exitEquityProceedsCents > 0n;
  const cap = explicitExit
    ? { proceedsCents: input.exitEquityProceedsCents, exitGap: false, note: null }
    : exitEquityFromCap({
        exitCapRateBps: input.exitCapRateBps,
        year1NoiCents: input.year1NoiCents ?? 0n,
        growthBps: input.growthBps,
        holdYears: input.holdYears,
        upbCents: input.upbCents ?? 0n,
      });
  const exit = cap.proceedsCents;
  const exitGap = cap.exitGap;
  const exitNote = cap.note;
  const notes: string[] = [];

  const proforma = runDealProforma({
    config: input.config,
    lpContributedCents: input.lpContributedCents,
    unreturnedCapitalCents: input.unreturnedCapitalCents,
    unpaidPrefCents: input.unpaidPrefCents,
    prefPaidToDateCents: input.prefPaidToDateCents,
    holdYears: input.holdYears,
    year1CfadsCents: input.year1CfadsCents,
    cfadsGrowthBps: input.growthBps,
    exitEquityProceedsCents: exit,
    europeanPromoteOpen: input.europeanPromoteOpen,
    operationsDeductionCents: fee.annualCents,
    debtServiceCents: annualDebt,
  });

  const lpEquity = input.lpContributedCents > 0n ? input.lpContributedCents : 0n;
  const rcpEquity = rcpEquityCents({
    lpContributedCents: lpEquity,
    gpCoInvestBps: input.config.gpCoInvestBps,
    equityRequiredCents: input.equityRequiredCents,
    lookThrough: isLookThroughTemplate(input.config.templateId),
  });

  const years = proforma.years.map((row) => ({
    year: row.year,
    lpCents: row.lpCents,
    lpOperatingCents: row.lpOperatingCents,
    rcpCents: row.rcpCents,
    rcpOperatingCents: row.rcpOperatingCents,
    feePaidCents: row.feePaidCents,
  }));
  const feeAccruedUnpaidCents = proforma.years.at(-1)?.feeAccruedCents ?? 0n;

  const lpFlows: IrrCashFlow[] = [{ amount: -Number(lpEquity), tYears: 0 }];
  const rcpFlows: IrrCashFlow[] = [{ amount: -Number(rcpEquity), tYears: 0 }];
  let lpOps = 0n;
  let rcpOps = 0n;
  let rcpTotal = 0n;
  for (const row of years) {
    lpFlows.push({ amount: Number(row.lpCents), tYears: row.year });
    rcpFlows.push({ amount: Number(row.rcpCents), tYears: row.year });
    lpOps += row.lpOperatingCents;
    rcpOps += row.rcpOperatingCents;
    rcpTotal += row.rcpCents;
  }

  const n = BigInt(years.length || 1);
  let gap: string | null = null;
  let lpNetIrrBps: number | null = null;
  let lpIrrNote: string | null = null;
  let lpYear1: number | null = null;
  let lpAvg: number | null = null;
  if (lpEquity <= 0n) {
    gap = "LP equity is not on file";
  } else {
    const year1Ops = years[0]?.lpOperatingCents ?? 0n;
    lpYear1 = yieldBps(year1Ops, lpEquity);
    lpAvg = yieldBps(lpOps / n, lpEquity);
    if (exitGap) lpIrrNote = EXIT_VALUE_NEEDED;
    else {
      const irr = solveIrr(lpFlows);
      lpNetIrrBps = rateToBps(irr.rate);
      if (irr.reason && lpNetIrrBps == null) lpIrrNote = IRR_NOT_AVAILABLE;
      else if (exitNote) lpIrrNote = exitNote;
    }
  }

  let rcpIrrBps: number | null = null;
  let rcpIrrNote: string | null = null;
  let rcpMultipleNote: string | null = null;
  let rcpYear1: number | null = null;
  let rcpAvg: number | null = null;
  let multiple: number | null = null;
  if (rcpEquity <= 0n) {
    notes.push("RCP equity is zero, so RCP cash-on-cash, IRR, and equity multiple stay blank.");
  } else {
    const year1Ops = years[0]?.rcpOperatingCents ?? 0n;
    rcpYear1 = yieldBps(year1Ops, rcpEquity);
    rcpAvg = yieldBps(rcpOps / n, rcpEquity);
    if (exitGap) {
      rcpIrrNote = EXIT_VALUE_NEEDED;
      rcpMultipleNote = EXIT_VALUE_NEEDED;
    } else {
      const irr = solveIrr(rcpFlows);
      rcpIrrBps = rateToBps(irr.rate);
      if (irr.reason && rcpIrrBps == null) rcpIrrNote = IRR_NOT_AVAILABLE;
      else if (exitNote) rcpIrrNote = exitNote;
      multiple = yieldBps(rcpTotal, rcpEquity);
    }
  }
  for (const note of [lpIrrNote, rcpIrrNote]) {
    if (note && !notes.includes(note)) notes.push(note);
  }
  if (exitNote && !exitGap && !notes.includes(exitNote)) notes.push(exitNote);
  for (const note of proforma.notes) {
    if (note === FEE_ACCRUED_UNPAID_NOTE && feeAccruedUnpaidCents <= 0n) continue;
    if (CASH_NOTES.has(note) && !notes.includes(note)) notes.push(note);
  }

  return {
    gap,
    feeAnnualCents: fee.annualCents,
    holdYears: proforma.holdYears,
    lpEquityCents: lpEquity,
    rcpEquityCents: rcpEquity,
    lpNetIrrBps,
    lpIrrNote,
    lpYear1CashYieldBps: lpYear1,
    lpAvgCashYieldBps: lpAvg,
    rcpIrrBps,
    rcpIrrNote,
    rcpEquityMultipleNote: rcpMultipleNote,
    rcpYear1CashOnCashBps: rcpYear1,
    rcpAvgCashOnCashBps: rcpAvg,
    rcpEquityMultipleBps: multiple,
    exitGap,
    exitEquityProceedsCents: exit,
    feeAccruedUnpaidCents,
    years,
    notes,
  };
}
