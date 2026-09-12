import type { AmortRow } from "./types";

const MONTHS_PER_YEAR = 12n;
const BPS_DENOMINATOR = 10_000n;

/** Half-up monthly interest: UPB × annual bps / (12 × 10_000). */
export function monthlyInterestCents(upbCents: bigint, annualRateBps: number): bigint {
  if (upbCents <= 0n || annualRateBps <= 0) return 0n;
  const denom = MONTHS_PER_YEAR * BPS_DENOMINATOR;
  return (upbCents * BigInt(annualRateBps) + denom / 2n) / denom;
}

export function amortizePeriod(opts: {
  upbCents: bigint;
  annualRateBps: number;
  paymentCents: bigint;
}): { interestCents: bigint; principalCents: bigint; endingUpbCents: bigint } {
  const interestCents = monthlyInterestCents(opts.upbCents, opts.annualRateBps);
  let principalCents = opts.paymentCents - interestCents;
  if (principalCents < 0n) principalCents = 0n;
  if (principalCents > opts.upbCents) principalCents = opts.upbCents;
  return {
    interestCents,
    principalCents,
    endingUpbCents: opts.upbCents - principalCents,
  };
}

export function addMonths(year: number, month: number, count: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + count;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

export function buildAmortizationSchedule(opts: {
  upbCents: bigint;
  annualRateBps: number;
  paymentCents: bigint;
  startYear: number;
  startMonth: number;
  periods: number;
}): AmortRow[] {
  const rows: AmortRow[] = [];
  let upb = opts.upbCents;
  for (let i = 0; i < opts.periods && upb > 0n; i += 1) {
    const { year, month } = addMonths(opts.startYear, opts.startMonth, i);
    const step = amortizePeriod({
      upbCents: upb,
      annualRateBps: opts.annualRateBps,
      paymentCents: opts.paymentCents,
    });
    rows.push({
      year,
      month,
      interestCents: step.interestCents,
      principalCents: step.principalCents,
      endingUpbCents: step.endingUpbCents,
    });
    upb = step.endingUpbCents;
  }
  return rows;
}

/** Next-12-month principal is the current portion of LTD. */
export function currentPortionFromSchedule(rows: AmortRow[]): bigint {
  return rows.reduce((acc, row) => acc + row.principalCents, 0n);
}

export function splitCurrentLt(opts: {
  upbCents: bigint;
  annualRateBps: number;
  paymentCents: bigint;
  startYear: number;
  startMonth: number;
  months?: number;
}): { currentPortionCents: bigint; longTermPortionCents: bigint } {
  const horizon = opts.months ?? 12;
  const rows = buildAmortizationSchedule({
    upbCents: opts.upbCents,
    annualRateBps: opts.annualRateBps,
    paymentCents: opts.paymentCents,
    startYear: opts.startYear,
    startMonth: opts.startMonth,
    periods: horizon,
  });
  const currentPortionCents = currentPortionFromSchedule(rows);
  const capped = currentPortionCents > opts.upbCents ? opts.upbCents : currentPortionCents;
  return {
    currentPortionCents: capped,
    longTermPortionCents: opts.upbCents - capped,
  };
}

/** Dr 2210 / Cr 2110 to move LT principal into the current bucket. */
export function currentPortionRollAmount(opts: {
  glCurrentCents: bigint;
  glLtCents: bigint;
  targetCurrentCents: bigint;
}): bigint {
  const total = opts.glCurrentCents + opts.glLtCents;
  const target = opts.targetCurrentCents > total ? total : opts.targetCurrentCents;
  const needed = target - opts.glCurrentCents;
  if (needed <= 0n) return 0n;
  return needed > opts.glLtCents ? opts.glLtCents : needed;
}

export function monthsToMaturity(asOf: Date, maturity: Date): number {
  const months =
    (maturity.getUTCFullYear() - asOf.getUTCFullYear()) * 12 +
    (maturity.getUTCMonth() - asOf.getUTCMonth());
  return months < 0 ? 0 : months;
}
