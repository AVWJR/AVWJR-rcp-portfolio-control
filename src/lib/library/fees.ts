/**
 * Fee assumptions the owner still has to type.
 * No percent and no dollar amount is invented. Blank means "fee needed".
 * LP net IRR (Phase 2) needs the deal fees. OpCo G&A is a separate blank.
 */

export const FEE_NEEDED = "fee needed";

export function dealFeesMissing(entity: {
  amFeeBps?: number | null;
  otherLpFeeCents?: bigint | number | null;
}): boolean {
  return entity.amFeeBps == null || entity.otherLpFeeCents == null;
}

export function dealFeeNeededLabel(entity: {
  amFeeBps?: number | null;
  otherLpFeeCents?: bigint | number | null;
}): string | null {
  return dealFeesMissing(entity) ? FEE_NEEDED : null;
}

export function opcoFeeNeededLabel(gaBudgetCents: bigint | number | null | undefined): string | null {
  return gaBudgetCents == null ? FEE_NEEDED : null;
}
