/** Shared matchers so offline coach and chips agree on clear how-to questions. */

export function isWaterfallQuery(q: string): boolean {
  return /(waterfall|promote|pref(?:erred)? return|lp\s*\/\s*gp|catch-?up|hurdle irr|deal waterfall|co-?gp|proforma)/i.test(q);
}

export function isDeleteDealQuery(q: string): boolean {
  return /(delete|remove|undo|get rid of|kill|archive|hide|restore)\b.{0,40}\b(deal|spe|propert|intake|draft)\b|\b(deal|spe|propert)\b.{0,20}\b(delete|remove|archive|hide|restore)\b|deal archive|archived deals?/i.test(
    q,
  );
}

export function isVagueQuery(q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  if (/^(hmm+|uh+|um+|ok+|okay|yes|no|thanks|thank you|help|what|wow|huh|\?+)\.?$/i.test(t)) return true;
  return t.length < 4;
}

export function isClearHowToQuery(q: string): boolean {
  if (isVagueQuery(q)) return false;
  if (isDeleteDealQuery(q)) return true;
  if (isWaterfallQuery(q)) return true;
  return /\b(how (do i|can i|to)|i need to|where (do i|can i|is)|walk me|click path|open the|export|upload|import|unlock|partner view|scheduler|vault|narrative|add deal|month-end|hard lock)\b/i.test(
    q,
  );
}
