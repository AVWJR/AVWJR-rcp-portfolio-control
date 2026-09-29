/** Show a typed 0 as "0". Null is an empty box (use the field's default). */
export function centsToDollarsInput(cents: bigint | null | undefined): string {
  if (cents == null) return "";
  const n = Number(cents) / 100;
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/** Empty box → null. "0" → 0n. Does not turn a typed zero into blank. */
export function dollarsInputToOptionalCents(raw: string): bigint | null {
  const t = raw.trim().replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 100));
}
