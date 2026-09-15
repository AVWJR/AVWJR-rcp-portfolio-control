/** Shared matchers so offline coach and chips agree on clear how-to questions. */

import {
  isAddDealQuery,
  isDeleteDealQuery as playbookDeleteDeal,
  isDownloadCanonicalQuery,
  isHowToQuery,
  isNarrativesPackQuery,
  isPartnerLimitsQuery,
  isRentRollHowToQuery,
  isT12UploadQuery,
  isVaultUploadQuery,
  matchHowTo,
} from "./how-to-playbook";

export function isDeleteDealQuery(q: string): boolean {
  return playbookDeleteDeal(q);
}

export function isVagueQuery(q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  if (/^(hmm+|uh+|um+|ok+|okay|yes|no|thanks|thank you|help|what|wow|huh|\?+)\.?$/i.test(t)) return true;
  return t.length < 4;
}

export function isClearHowToQuery(q: string): boolean {
  if (isVagueQuery(q)) return false;
  if (isHowToQuery(q)) return true;
  if (isDeleteDealQuery(q) || isT12UploadQuery(q) || isRentRollHowToQuery(q) || isAddDealQuery(q)) return true;
  if (isDownloadCanonicalQuery(q) || isVaultUploadQuery(q) || isNarrativesPackQuery(q) || isPartnerLimitsQuery(q)) {
    return true;
  }
  return /\b(how (do i|can i|to)|i need to|where (do i|can i|is)|walk me|click path|open the|export|upload|import|unlock|partner view|scheduler|vault|narrative|add deal|month-end|hard lock|re-?apply|re-?upload|t-?12)\b/i.test(
    q,
  );
}

export { matchHowTo, isT12UploadQuery, isRentRollHowToQuery, isHowToQuery };
