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
  if (!t || t === "." || t === "-") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 100));
}

export type DollarFieldState = {
  /** Raw text. Kept as typed so "1234." is not rewritten to "1234" mid-entry. */
  text: string;
  cents: bigint | null;
};

/** Keystroke: keep the characters. Convert for the preview without rewriting the box. */
export function dollarFieldOnChange(raw: string): DollarFieldState {
  return { text: raw, cents: dollarsInputToOptionalCents(raw) };
}

/** Blur: blank stays blank (null). "0" stays 0. A trailing dot normalizes. */
export function dollarFieldOnBlur(text: string, opts?: { nullable?: boolean }): DollarFieldState {
  const cents = dollarsInputToOptionalCents(text);
  if (opts?.nullable === false && cents == null) return { text: "0", cents: 0n };
  return { text: centsToDollarsInput(cents), cents };
}

/** Apply one character at a time the way a controlled input receives onChange. */
export function typeDollarKeys(keys: string): DollarFieldState {
  let text = "";
  let cents: bigint | null = null;
  for (const key of keys) {
    const next = dollarFieldOnChange(text + key);
    text = next.text;
    cents = next.cents;
  }
  return { text, cents };
}
