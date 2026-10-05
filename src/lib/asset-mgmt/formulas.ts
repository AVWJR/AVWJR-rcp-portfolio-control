import { perUnitCents, ratioBps as sharedRatioBps } from "@rcp/analytics";
import { formatUsd } from "@rcp/ledger";
import { formatRatioBps } from "@rcp/properties";

/**
 * Phase 1 asset-plan math. Amounts are integer cents. Ratios are integer
 * basis points (10_000 = 100%), truncating division, same as the ledger.
 * A missing input or a zero denominator returns null. It does not return 0.
 */

export const NOT_AVAILABLE = "Not available";

export const BLEND_METHOD = {
  version: "phase1-no-blend-v1",
  name: "No blend",
  statement:
    "Phase 1 stores each permitted observation on its own. It does not weight sources. A recommended rent range is not produced until a pricing band is supplied.",
} as const;

/** Display rule only. An observation older than this, versus the selected period end, is marked stale. */
export const STALE_AFTER_DAYS = 45;

export const FORMULAS = {
  revpau:
    "RevPAU = period revenue ÷ rentable units. Revenue is book EGI when this period has income-statement activity. Otherwise it is rent-roll in-place rent minus concessions. Rentable units are every unit except DOWN. The result is integer cents (truncating division). Blank when revenue is missing or rentable units are zero.",
  lossToLease:
    "Floored loss-to-lease = Σ max(0, rent-roll market rent − in-place rent) on revenue occupied units. Positive means in-place is below the rent-roll market rent. Signed loss-to-lease keeps a negative gain-to-lease. Vacant, DOWN, model, employee, and admin units are excluded. This is the rent-roll KPI, not a new definition.",
  occupancy:
    "Physical occupancy = occupied ÷ rentable, in basis points. Rentable excludes DOWN. Blank when there are no rentable units. Vacancy loss = Σ rent-roll market rent of VACANT units.",
  concessions:
    "Concessions = Σ concession amounts on occupied units from the rent roll. Concession end dates are not on the unit file, so burn-off timing is not calculated.",
  otherIncomePerOccupied:
    "Other income per occupied unit = book other income (4100 and 4110–4190) ÷ occupied units. Blank when occupied units are zero or this period has no income-statement activity.",
  payrollPerUnit:
    "Payroll per unit = (5110 + 5120) ÷ rentable units when a rent roll is on file, otherwise ÷ the deal unit count. Payroll per occupied unit uses occupied units. Blank when the denominator is zero or payroll was not posted this period.",
  controllableOpexPerUnit:
    "Controllable opex per unit = (5110 + 5120 + 5210 + 5220 + 5410 + 5510 + 5610 + 5910 + 5990) ÷ the same unit denominator. Utilities, taxes, and insurance are excluded. Blank when the denominator is zero or this period has no books.",
  noiMargin:
    "NOI margin = period NOI ÷ period EGI, in basis points. Blank when EGI is zero or this period has no income-statement activity.",
  utilityRecovery:
    "Utility recovery = RUBS (4110) ÷ utilities (5310–5350), in basis points. Blank when utilities are zero or those accounts were not posted this period.",
} as const;

export function centsPerCount(amount: bigint | null, count: number): bigint | null {
  if (amount == null) return null;
  return perUnitCents(amount, count);
}

export function ratioBps(numerator: bigint | null, denominator: bigint | null): number | null {
  if (numerator == null || denominator == null) return null;
  return sharedRatioBps(numerator, denominator);
}

export function revpauCents(revenueCents: bigint | null, rentableCount: number): bigint | null {
  return centsPerCount(revenueCents, rentableCount);
}

export function noiMarginBps(noiCents: bigint | null, egiCents: bigint | null): number | null {
  return ratioBps(noiCents, egiCents);
}

export function utilityRecoveryBps(rubsCents: bigint | null, utilityCents: bigint | null): number | null {
  return ratioBps(rubsCents, utilityCents);
}

/** Positive gap means this deal is higher than the lower median of the peers. */
export function peerGapPerUnit(ownPerUnit: bigint | null, peerPerUnits: readonly bigint[]): bigint | null {
  if (ownPerUnit == null || peerPerUnits.length === 0) return null;
  const sorted = [...peerPerUnits].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const median = sorted[(sorted.length - 1) >> 1];
  if (median == null) return null;
  return ownPerUnit - median;
}

export function dollarsAtStake(gapPerUnit: bigint | null, units: number): bigint | null {
  if (gapPerUnit == null || gapPerUnit <= 0n || !Number.isInteger(units) || units <= 0) return null;
  return gapPerUnit * BigInt(units);
}

export function paybackMonths(setupCostCents: bigint | null, monthlyGapCents: bigint | null): number | null {
  if (setupCostCents == null || monthlyGapCents == null || monthlyGapCents <= 0n) return null;
  return Number(setupCostCents / monthlyGapCents);
}

export type RankedItem = {
  code: string;
  impactCents: bigint | null;
  revpauDeltaCents: bigint | null;
};

function compareNullableDesc(a: bigint | null, b: bigint | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

/** Highest operating-margin dollars first, then RevPAU effect. Null impact sorts last. Occupancy rate is not a sort key. */
export function rankByMarginImpact<T extends RankedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const byImpact = compareNullableDesc(a.impactCents, b.impactCents);
    if (byImpact !== 0) return byImpact;
    return compareNullableDesc(a.revpauDeltaCents, b.revpauDeltaCents);
  });
}

export function daysBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function observationIsStale(asOfDate: string, referenceDate: string, staleAfterDays = STALE_AFTER_DAYS): boolean {
  const age = daysBetween(asOfDate, referenceDate);
  if (age == null) return true;
  return age > staleAfterDays;
}

/** Lost rent per day from a monthly rent-roll market rent, using a 30-day month. Not a lease term. A zero market rent stays blank. */
export function lostRentPerDayCents(monthlyMarketRent: bigint | null): bigint | null {
  if (monthlyMarketRent == null || monthlyMarketRent <= 0n) return null;
  return monthlyMarketRent / 30n;
}

export function presentCents(cents: bigint | null | undefined): string {
  if (cents == null) return NOT_AVAILABLE;
  return formatUsd(cents);
}

export function presentBps(bps: number | null | undefined): string {
  if (bps == null) return NOT_AVAILABLE;
  return formatRatioBps(bps);
}

export type ScoreSnapshot = {
  periodLabel: string;
  revpauCents: string | null;
  noiMarginBps: number | null;
  lossToLeaseCents: string | null;
  vacancyLossCents: string | null;
  otherIncomePerOccupiedCents: string | null;
  payrollPerUnitCents: string | null;
  controllableOpexPerUnitCents: string | null;
  illustrativeRevpauCents: string | null;
  observationCount: number;
  latestSource: string | null;
  latestAsOf: string | null;
  latestValueCents: string | null;
  /** book-egi, rent-roll, or none. Older saved scores may omit it. */
  revenueBase?: "book-egi" | "rent-roll" | "none" | null;
};

export type ChangeRow = {
  label: string;
  before: string;
  after: string;
  cause: string;
};

function snapValue(value: string | number | null): string {
  if (value == null || value === "") return NOT_AVAILABLE;
  return String(value);
}

export function revenueBaseLabel(base: ScoreSnapshot["revenueBase"]): string {
  if (base === "book-egi") return "Book EGI";
  if (base === "rent-roll") return "Rent roll";
  if (base === "none") return "Not available";
  return "Base not labeled";
}

function observationLabel(snapshot: ScoreSnapshot): string {
  if (!snapshot.latestSource) return "No permitted market observation";
  const value = snapshot.latestValueCents == null ? "no dollar value" : presentCents(BigInt(snapshot.latestValueCents));
  return `${snapshot.latestSource} as of ${snapshot.latestAsOf ?? "date not supplied"} (${value})`;
}

export function whatChanged(previous: ScoreSnapshot | null, next: ScoreSnapshot): ChangeRow[] {
  if (!previous) {
    return [
      {
        label: "Saved score",
        before: NOT_AVAILABLE,
        after: observationLabel(next),
        cause: "This is the first saved score for this deal.",
      },
    ];
  }

  const rows: ChangeRow[] = [];
  const pair = (label: string, before: string, after: string, cause: string) => {
    if (before !== after) rows.push({ label, before, after, cause });
  };

  pair(
    "Period",
    previous.periodLabel,
    next.periodLabel,
    "The saved score follows the period selected when the update was entered.",
  );
  const beforeRevpau = presentCents(previous.revpauCents == null ? null : BigInt(previous.revpauCents));
  const afterRevpau = presentCents(next.revpauCents == null ? null : BigInt(next.revpauCents));
  const beforeBase = revenueBaseLabel(previous.revenueBase);
  const afterBase = revenueBaseLabel(next.revenueBase);
  const basesDiffer = Boolean(previous.revenueBase && next.revenueBase && previous.revenueBase !== next.revenueBase);
  if (basesDiffer) {
    rows.push({
      label: "RevPAU",
      before: `${beforeRevpau} · ${beforeBase}`,
      after: `${afterRevpau} · ${afterBase}`,
      cause: "The revenue base changed, so these RevPAU figures are not compared.",
    });
  } else if (`${beforeRevpau} · ${beforeBase}` !== `${afterRevpau} · ${afterBase}`) {
    rows.push({
      label: "RevPAU",
      before: `${beforeRevpau} · ${beforeBase}`,
      after: `${afterRevpau} · ${afterBase}`,
      cause: `RevPAU base: ${afterBase}.`,
    });
  }
  pair(
    "NOI margin",
    presentBps(previous.noiMarginBps),
    presentBps(next.noiMarginBps),
    "NOI margin is period NOI divided by period EGI.",
  );
  pair(
    "Loss-to-lease",
    presentCents(previous.lossToLeaseCents == null ? null : BigInt(previous.lossToLeaseCents)),
    presentCents(next.lossToLeaseCents == null ? null : BigInt(next.lossToLeaseCents)),
    "Loss-to-lease is from the rent roll. A weekly comp does not overwrite the rent-roll market rent.",
  );
  pair(
    "Vacancy loss",
    presentCents(previous.vacancyLossCents == null ? null : BigInt(previous.vacancyLossCents)),
    presentCents(next.vacancyLossCents == null ? null : BigInt(next.vacancyLossCents)),
    "Vacancy loss is the rent-roll market rent of vacant units.",
  );
  pair(
    "Illustrative RevPAU",
    presentCents(previous.illustrativeRevpauCents == null ? null : BigInt(previous.illustrativeRevpauCents)),
    presentCents(next.illustrativeRevpauCents == null ? null : BigInt(next.illustrativeRevpauCents)),
    "Illustrative RevPAU uses sourced asking rents on vacant units. It is not a pricing band.",
  );
  if (
    previous.latestSource !== next.latestSource ||
    previous.latestAsOf !== next.latestAsOf ||
    previous.latestValueCents !== next.latestValueCents ||
    previous.observationCount !== next.observationCount
  ) {
    rows.push({
      label: "Latest market observation",
      before: `${observationLabel(previous)} · ${previous.observationCount} on file`,
      after: `${observationLabel(next)} · ${next.observationCount} on file`,
      cause: "A weekly update was saved. Sources are not blended.",
    });
  }

  if (rows.length === 0) {
    rows.push({
      label: "Saved score",
      before: "Same as the prior saved score",
      after: "Same as the prior saved score",
      cause: "Nothing in the scored figures changed.",
    });
  }
  return rows.map((row) => ({
    ...row,
    before: snapValue(row.before),
    after: snapValue(row.after),
  }));
}

export function centsToSnapshot(value: bigint | null): string | null {
  return value == null ? null : value.toString();
}
