/**
 * LP deal scope. Null means scoping is not configured (the partner view still
 * sees the live portfolio). A list means that LP sees only those SPE codes.
 * This is not a login system — auth stays on the open access work.
 */
export function dealsVisibleToLp(dealCodes: string[], lpDealCodes: string[] | null | undefined): string[] {
  if (lpDealCodes == null) return [...dealCodes];
  const allow = new Set(lpDealCodes);
  return dealCodes.filter((code) => allow.has(code));
}

export function lpCanSeeDeal(entityCode: string, lpDealCodes: string[] | null | undefined): boolean {
  return dealsVisibleToLp([entityCode], lpDealCodes).length === 1;
}
