import { FEE_NEEDED } from "@/lib/library/fees";

/**
 * Annual dollars taken off operations before the waterfall.
 * AM fee is a percent of purchase price. Other LP fees are the typed annual dollars.
 * A typed 0 is zero. A blank fee is "fee needed". Nothing is guessed.
 */

export type FeeInputs = {
  amFeeBps: number | null;
  otherLpFeeCents: bigint | null;
  purchasePriceCents: bigint | null;
};

export type FeeResolution =
  | { ok: true; annualCents: bigint; amFeeCents: bigint; otherLpFeeCents: bigint }
  | { ok: false; gap: string };

export function resolveAnnualFee(input: FeeInputs): FeeResolution {
  if (input.amFeeBps == null || input.otherLpFeeCents == null) {
    return { ok: false, gap: FEE_NEEDED };
  }
  const other = input.otherLpFeeCents > 0n ? input.otherLpFeeCents : 0n;
  if (input.amFeeBps <= 0) {
    return { ok: true, annualCents: other, amFeeCents: 0n, otherLpFeeCents: other };
  }
  if (input.purchasePriceCents == null || input.purchasePriceCents <= 0n) {
    return { ok: false, gap: "purchase price needed" };
  }
  const am = (input.purchasePriceCents * BigInt(input.amFeeBps)) / 10_000n;
  return { ok: true, annualCents: am + other, amFeeCents: am, otherLpFeeCents: other };
}
