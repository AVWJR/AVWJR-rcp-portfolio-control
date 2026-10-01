/**
 * IRR over dated or annual cash flows.
 * Bounded bisection. No NaN. No unbounded loop.
 * Multiple sign changes: the root with the smallest absolute value, ties go to the lower rate.
 */

export type IrrCashFlow = {
  amount: number;
  /** Years from the first cash flow. 0 is the investment date. */
  tYears: number;
};

export type IrrSolution = {
  rate: number | null;
  reason: string | null;
};

const SCAN_LOW = -0.9;
const SCAN_HIGH = 10;
const SCAN_STEP = 0.05;
const MAX_BISECT = 80;

function npv(rate: number, flows: IrrCashFlow[]): number {
  let sum = 0;
  for (const flow of flows) {
    const base = 1 + rate;
    if (base <= 0) return Number.NaN;
    sum += flow.amount / Math.pow(base, flow.tYears);
  }
  return sum;
}

function signChange(amounts: number[]): boolean {
  let sign = 0;
  for (const amount of amounts) {
    if (!Number.isFinite(amount) || amount === 0) continue;
    const next = amount > 0 ? 1 : -1;
    if (sign === 0) sign = next;
    else if (next !== sign) return true;
  }
  return false;
}

function bisect(lo: number, hi: number, flows: IrrCashFlow[]): number | null {
  let left = lo;
  let right = hi;
  let leftNpv = npv(left, flows);
  if (!Number.isFinite(leftNpv)) return null;
  for (let i = 0; i < MAX_BISECT; i += 1) {
    const mid = (left + right) / 2;
    const midNpv = npv(mid, flows);
    if (!Number.isFinite(midNpv)) return null;
    if (Math.abs(midNpv) < 1e-7 || Math.abs(right - left) < 1e-10) return mid;
    if (leftNpv === 0) return left;
    if (leftNpv * midNpv <= 0) right = mid;
    else {
      left = mid;
      leftNpv = midNpv;
    }
  }
  const mid = (left + right) / 2;
  return Number.isFinite(mid) ? mid : null;
}

export function yearFraction(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365 * 24 * 60 * 60 * 1000);
}

/** Build tYears from dates. The first date is t = 0. */
export function cashFlowsFromDates(rows: { amount: number; date: Date }[]): IrrCashFlow[] {
  if (!rows.length) return [];
  const first = rows[0]!.date;
  return rows.map((row) => ({ amount: row.amount, tYears: yearFraction(first, row.date) }));
}

/**
 * Solve NPV(r) = 0.
 * A series with no sign change returns null and a reason. It does not return NaN.
 */
export function solveIrr(flows: IrrCashFlow[]): IrrSolution {
  const clean = flows.filter((flow) => Number.isFinite(flow.amount) && Number.isFinite(flow.tYears));
  if (clean.length < 2) return { rate: null, reason: "Need at least two cash flows" };
  if (clean.some((flow) => flow.tYears < 0)) {
    return { rate: null, reason: "Cash flow timing is before the first date" };
  }
  if (!signChange(clean.map((flow) => flow.amount))) {
    return { rate: null, reason: "No sign change in the cash flows" };
  }

  const roots: number[] = [];
  let prevT = SCAN_LOW;
  let prevNpv = npv(prevT, clean);
  for (let t = SCAN_LOW + SCAN_STEP; t <= SCAN_HIGH + 1e-9; t += SCAN_STEP) {
    const value = npv(t, clean);
    if (Number.isFinite(prevNpv) && Number.isFinite(value)) {
      if (prevNpv === 0) roots.push(prevT);
      else if (prevNpv * value < 0) {
        const root = bisect(prevT, t, clean);
        if (root != null && Number.isFinite(root)) roots.push(root);
      }
    }
    prevT = t;
    prevNpv = value;
  }

  if (!roots.length) return { rate: null, reason: "No IRR in range" };
  roots.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  const rate = roots[0]!;
  if (!Number.isFinite(rate)) return { rate: null, reason: "IRR did not converge" };
  return { rate, reason: null };
}

export function rateToBps(rate: number | null): number | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Math.round(rate * 10_000);
}
