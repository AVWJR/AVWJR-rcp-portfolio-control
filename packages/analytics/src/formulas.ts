/**
 * Auditable ratio helpers. Integer cents in, integer bps out (truncating
 * division, same as Phase B occupancy / Phase C covenants).
 *
 * Do not invent occupancy from vacancy GL, LTV from book cost, or
 * delinquency from tenant AR 1110.
 */

import type { CapexReserveCompare, CashBreakdown, ConcentrationRow, TrailingNoi } from "./types";

export const BPS_DENOMINATOR = 10_000n;

/** Controllable in-NOI OpEx. Insurance and RE taxes are non-controllable. */
export const CONTROLLABLE_OPEX_CODES = ["5110", "5210", "5310", "5410", "5510", "5610", "5990"] as const;

/** Insurance + real estate taxes — owner-level, not site-controllable. */
export const NON_CONTROLLABLE_OPEX_CODES = ["5710", "5810"] as const;

/** Property management fees — contractual, disclosed separately (not tagged controllable). */
export const CONTRACTUAL_OPEX_CODES = ["5910"] as const;

/** OpCo G&A for the G&A% ratio: payroll + administrative + other. */
export const OPCO_GA_CODES = ["5110", "5610", "5990"] as const;

export const CASH_CODES = {
  operating: "1010",
  reserve: "1020",
  escrow: "1030",
  deposits: "1040",
} as const;

export const PPE_ADDITION_CODES = ["1420", "1430", "1440", "1450", "1460"] as const;

export function ratioBps(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  return Number((numerator * BPS_DENOMINATOR) / denominator);
}

export function perUnitCents(amount: bigint, units: number): bigint | null {
  if (units <= 0) return null;
  return amount / BigInt(units);
}

/** Period NOI × periods-in-year. Label as annualized period — never as T12. */
export function annualizePeriodNoi(periodNoiCents: bigint, periodsInYear = 12): bigint {
  return periodNoiCents * BigInt(periodsInYear);
}

/**
 * Trailing-12 NOI is the sum of the last 12 monthly period NOI figures.
 * Fewer than 12 months is incomplete — do not silently annualize and call it T12.
 */
export function trailingNoi(monthlyNoiCents: readonly bigint[]): TrailingNoi {
  const last12 = monthlyNoiCents.slice(-12);
  return {
    definition: last12.length >= 12 ? "t12" : "incomplete",
    monthsAvailable: last12.length,
    requiredMonths: 12,
    noiCents: last12.reduce((acc, v) => acc + v, 0n),
  };
}

export function sumByCodes(amounts: Map<string, bigint>, codes: readonly string[]): bigint {
  return codes.reduce((acc, code) => acc + (amounts.get(code) ?? 0n), 0n);
}

export function opexRatioBps(opexCents: bigint, egiCents: bigint): number | null {
  return ratioBps(opexCents, egiCents);
}

export function noiPerUnitCents(noiCents: bigint, unitCount: number): bigint | null {
  return perUnitCents(noiCents, unitCount);
}

/**
 * CFADS (period, book) = period NOI − period PPE additions − monthly reserve requirement.
 * PPE additions are the net increase in 1420–1460 (CIP spend and direct-to-asset CapEx).
 * Place-in-service (1460 → 1430) nets to zero. Reserve requirement is the loan-file monthly
 * target, not a GL funding journal.
 */
export function cfadsCents(opts: {
  periodNoiCents: bigint;
  periodCapexCents: bigint;
  reserveRequirementCents: bigint;
}): bigint {
  return opts.periodNoiCents - opts.periodCapexCents - opts.reserveRequirementCents;
}

export function cfadsDscrBps(cfads: bigint, debtServiceCents: bigint): number | null {
  if (debtServiceCents <= 0n) return null;
  return ratioBps(cfads, debtServiceCents);
}

export function cashBreakdown(amounts: Map<string, bigint>): CashBreakdown {
  const operating = amounts.get(CASH_CODES.operating) ?? 0n;
  const reserve = amounts.get(CASH_CODES.reserve) ?? 0n;
  const escrow = amounts.get(CASH_CODES.escrow) ?? 0n;
  const deposits = amounts.get(CASH_CODES.deposits) ?? 0n;
  return {
    operating,
    reserve,
    escrow,
    deposits,
    total: operating + reserve + escrow + deposits,
  };
}

export function compareCapexToReserves(opts: {
  periodCapexCents: bigint;
  reserveCashCents: bigint;
  reserveRequirementCents: bigint;
}): CapexReserveCompare {
  return {
    periodCapexCents: opts.periodCapexCents,
    reserveCashCents: opts.reserveCashCents,
    reserveRequirementCents: opts.reserveRequirementCents,
  };
}

/**
 * Months of OpEx coverage from ending cash, as hundredths of a month
 * (250 = 2.50 months). Null when period OpEx is zero.
 */
export function liquidityMonthsHundredths(cashCents: bigint, periodOpexCents: bigint): number | null {
  if (periodOpexCents <= 0n) return null;
  return Number((cashCents * 100n) / periodOpexCents);
}

export function gaRatioBps(gaCents: bigint, feeIncomeCents: bigint): number | null {
  return ratioBps(gaCents, feeIncomeCents);
}

export function concentrationBps(partCents: bigint, wholeCents: bigint): number | null {
  return ratioBps(partCents, wholeCents);
}

export function noiConcentration(
  rows: { entityCode: string; entityName: string; noiCents: bigint; unitCount: number }[],
): ConcentrationRow[] {
  const whole = rows.reduce((acc, r) => acc + r.noiCents, 0n);
  return rows.map((r) => ({
    ...r,
    shareBps: concentrationBps(r.noiCents, whole),
  }));
}

/**
 * Period PPE additions used as the cash-CapEx proxy: net increase in
 * building / improvements / FFE / CIP. Negative (disposals) floors at 0.
 */
export function periodPpeAdditionsCents(
  startByCode: Map<string, bigint>,
  endByCode: Map<string, bigint>,
): bigint {
  let delta = 0n;
  for (const code of PPE_ADDITION_CODES) {
    delta += (endByCode.get(code) ?? 0n) - (startByCode.get(code) ?? 0n);
  }
  return delta > 0n ? delta : 0n;
}

export function formatMonthsHundredths(value: number | null, locale = "en-US"): string {
  if (value === null) return "—";
  return `${(value / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} mo`;
}

export function formatNoiDefinition(definition: "period" | "t12" | "annualized_period" | "incomplete"): string {
  if (definition === "period") return "Period NOI";
  if (definition === "t12") return "T12 NOI";
  if (definition === "incomplete") return "T12 NOI (incomplete)";
  return "Annualized period NOI (not T12)";
}
