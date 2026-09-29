/**
 * Vendor label → RCP account. Label and keyword only.
 * Foreign account numbers are never used unless a saved client map says so.
 * First match wins (specific → generic), matching the monthly FS standard §6.2.
 */

export type MapConfidence = "EXACT" | "CLIENT_MAP" | "RULE" | "CONTEXT" | "NONE";

export type CrosswalkHit = {
  accountCode: string | null;
  confidence: MapConfidence;
  /** Balance-sheet memo: not a P&L account. */
  balanceSheet: boolean;
};

export type ClientMapRule = {
  sourceSystem?: string;
  sourceAccountNo?: string;
  normalizedLabel: string;
  accountCode: string;
};

const SKIP =
  /^(income|expense|expenses|operating expenses|revenue|revenues|other|totals?|subtotals?|net operating income|net operating|noi|egi|egr|effective gross(?: income)?|gross potential rent total|net income|ebitda|below noi|debt service|total assets|total liabilities|total equity|assets|liabilities|equity)$/i;

type Rule = {
  re: RegExp;
  code: string;
  balanceSheet?: boolean;
  /** When set, the rule applies only in that section. */
  section?: "income" | "expense" | "asset" | "liability";
};

const RULES: Rule[] = [
  { re: /asset management|asset mgmt/, code: "6310" },
  { re: /property management|management fee|mgmt fee|pm fee/, code: "5910" },
  { re: /loss to lease|gain to lease|\bltl\b|lease differential/, code: "4015" },
  { re: /model unit|employee unit|employee apt|admin unit|office unit|non.?revenue|courtesy unit|\bnru\b/, code: "4040", section: "income" },
  { re: /bad debt|write.?off|collection loss|credit loss/, code: "4050", section: "income" },
  { re: /concession|free rent|move.?in special|rent discount|\bspecials\b/, code: "4030" },
  { re: /vacancy|physical vacancy/, code: "4020" },
  { re: /utility reimb|rubs|billback|water reimb|trash reimb|utility income|utility recovery/, code: "4110" },
  { re: /late fee|late charge|\bnsf\b/, code: "4120" },
  { re: /application fee|admin fee|administrative fee|lease break|termination fee/, code: "4130", section: "income" },
  { re: /parking|garage|carport/, code: "4140", section: "income" },
  { re: /\bstorage\b/, code: "4150", section: "income" },
  { re: /pet rent|pet fee/, code: "4160" },
  { re: /laundry|vending/, code: "4170" },
  { re: /damage|cleaning fee|forfeited deposit/, code: "4180", section: "income" },
  { re: /interest income|investment income/, code: "4100" },
  { re: /amortization.*(loan|financing|debt)|(loan|financing|debt).*amortization/, code: "6120" },
  { re: /depreciation/, code: "6210" },
  { re: /amortization/, code: "6220" },
  { re: /mortgage interest|\binterest\b/, code: "6110" },
  { re: /principal|mortgage principal/, code: "2110", balanceSheet: true },
  { re: /capital expenditure|\bcapex\b|capital improvement/, code: "1460", balanceSheet: true },
  { re: /partnership|franchise tax|owner expense|investor reporting|entity fee|entity cost/, code: "6410" },
  { re: /make.?ready|turnover|unit turn|painting turnover|carpet clean/, code: "5220" },
  { re: /payroll|salar|wage|bonus|benefit|payroll tax|workers comp|health insurance/, code: "5110" },
  { re: /repair|maintenance|r and m|plumbing|electrical|hvac repair|appliance repair/, code: "5210" },
  { re: /landscap|pest|security|elevator|pool service|\bcontract\b/, code: "5410" },
  { re: /marketing|advertis|promotion|resident relations/, code: "5510" },
  { re: /real estate tax|property tax|ad valorem/, code: "5810" },
  { re: /insurance/, code: "5710" },
  { re: /electric|water|sewer|\bgas\b|trash|utilit|vacant utilit/, code: "5310" },
  { re: /office|admin|legal|professional|audit|telephone|software|bank fee|postage/, code: "5610" },
  { re: /gross potential|market rent|apartment rent|residential rent|unit rent|rental income|\brent\b/, code: "4010" },
  { re: /other income|misc income|miscellaneous income|ancillary/, code: "4100" },
  { re: /other expense|misc expense|miscellaneous expense|other operating/, code: "5990" },
  { re: /security deposit/, code: "2050", balanceSheet: true, section: "liability" },
  { re: /accounts receivable|tenant receivable/, code: "1110", balanceSheet: true },
  { re: /accounts payable/, code: "2010", balanceSheet: true },
  { re: /prepaid rent/, code: "2040", balanceSheet: true },
  { re: /operating cash|^cash$|cash — operating|cash - operating/, code: "1010", balanceSheet: true },
  { re: /replacement reserve/, code: "1020", balanceSheet: true },
  { re: /escrow|impound/, code: "1030", balanceSheet: true },
];

export function normalizeVendorLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/r\s*&\s*m/g, "repairs and maintenance")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isStatementTotalLabel(label: string): boolean {
  const text = normalizeVendorLabel(label);
  if (!text) return true;
  return SKIP.test(text);
}

export function mapNormalizedLabel(label: string, section?: Rule["section"]): CrosswalkHit {
  const text = normalizeVendorLabel(label);
  if (!text || isStatementTotalLabel(text)) {
    return { accountCode: null, confidence: "NONE", balanceSheet: false };
  }
  if (/vacant utilit/.test(text)) {
    return { accountCode: "5310", confidence: "RULE", balanceSheet: false };
  }
  for (const rule of RULES) {
    if (rule.section && section && rule.section !== section) continue;
    if (!rule.re.test(text)) continue;
    if (rule.re.source.includes("vacancy") && /vacant utilit/.test(text)) continue;
    return {
      accountCode: rule.code,
      confidence: "RULE",
      balanceSheet: Boolean(rule.balanceSheet),
    };
  }
  return { accountCode: null, confidence: "NONE", balanceSheet: false };
}

export function applyClientMap(rule: ClientMapRule | null, fallback: CrosswalkHit): CrosswalkHit {
  if (!rule) return fallback;
  return { accountCode: rule.accountCode, confidence: "CLIENT_MAP", balanceSheet: fallback.balanceSheet };
}

/** Section hint from a nearby header, used only as a tie-break. */
export function sectionFromHeader(header: string): Rule["section"] | undefined {
  const text = normalizeVendorLabel(header);
  if (/income|revenue|rent/.test(text) && !/expense/.test(text)) return "income";
  if (/expense|operating/.test(text)) return "expense";
  if (/asset/.test(text)) return "asset";
  if (/liabilit|equity/.test(text)) return "liability";
  return undefined;
}
