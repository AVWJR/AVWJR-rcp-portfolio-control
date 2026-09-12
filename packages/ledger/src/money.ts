import { CENTS_PER_DOLLAR } from "./types";

/** Whole-dollar helper for seed and tests. Rejects fractional input. */
export function dollars(amount: number): bigint {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error(`dollars() expects a whole USD integer, got ${amount}`);
  }
  return BigInt(amount) * CENTS_PER_DOLLAR;
}

export function sum(values: bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function formatUsd(cents: bigint, locale = "en-US"): string {
  const negative = cents < 0n;
  const absCents = negative ? -cents : cents;
  const whole = absCents / CENTS_PER_DOLLAR;
  const frac = absCents % CENTS_PER_DOLLAR;
  const wholeFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Number(whole),
  );
  const body = `${wholeFmt}.${frac.toString().padStart(2, "0")}`;
  return negative ? `($${body})` : `$${body}`;
}
