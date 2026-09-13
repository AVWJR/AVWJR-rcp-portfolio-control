/** Books-to-tax and K-1-oriented types. Amounts are integer USD cents. */

export const TAX_BRIDGE_STATUS = "worksheet_ready" as const;

export const TAX_FILING_DISCLAIMER =
  "Books-to-tax worksheets and K-1-oriented exports support CPA preparation. Roche Capital Partners Portfolio Control does not file federal or state returns, does not produce a filed Form 1065/K-1 or 1099, and does not replace CPA or counsel.";

export const K1_EXPORT_LIMITATIONS = [
  "Not a filed Schedule K-1 (Form 1065).",
  "Capital accounts are book-basis rollforwards (beg + contrib − dist ± book NI = end).",
  "Ordinary income is allocated book net income, not tax special allocations, 704(c), or §743(b).",
  "No guaranteed payments, 199A, at-risk, or passive-activity worksheets.",
  "Seed SPEs are 100% owned — do not invent minority interest or a promote waterfall.",
  "Combined roll-up is not a tax consolidation or a GAAP consolidation.",
] as const;

export const FORM_1099_LIMITATIONS = [
  "Phase A AP (2010 / 2020) has no vendor invoice subledger.",
  "Vendor master + reportable-payment overlay is a CPA hook, not a filed 1099-NEC/MISC.",
  "If no vendor-coded payments exist, the export is empty and the stub is honest.",
] as const;

export type BasisLabel = "BOOKS" | "TAX" | "BRIDGE";

export type TaxLineKind =
  | "book_ni"
  | "book_dep"
  | "book_interest"
  | "book_am_fees"
  | "book_am_income"
  | "tax_dep_macrs"
  | "tax_interest_163j"
  | "adjustment"
  | "taxable_income_worksheet";

export type MacrsConvention = "MM" | "HY" | "NA";

export type MacrsLifeHook = {
  assetClass: string;
  label: string;
  accountCode: string | null;
  recoveryYears: number | null;
  convention: MacrsConvention;
  depreciable: boolean;
  notes: string;
};

export type PpeBases = {
  land: bigint;
  building: bigint;
  improvements: bigint;
  site: bigint;
  ffe: bigint;
  cip: bigint;
};

export type BookTaxSource = {
  netIncome: bigint;
  depreciation: bigint;
  interest: bigint;
  amFees: bigint;
  amIncome: bigint;
};

export type TaxAdjustmentInput = {
  lineCode: string;
  label: string;
  basis: BasisLabel;
  booksCents: bigint;
  taxCents: bigint;
  notes?: string;
};

export type TaxWorksheetLine = {
  key: string;
  kind: TaxLineKind;
  label: string;
  basis: BasisLabel;
  booksCents: bigint;
  taxCents: bigint;
  adjustmentCents: bigint;
  macrsClass?: string;
  macrsLifeYears?: number | null;
  accountCode?: string;
  notes?: string;
};

export type BooksToTaxWorksheet = {
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel: string;
  disclaimer: string;
  lines: TaxWorksheetLine[];
  bookNetIncome: bigint;
  bookDepreciation: bigint;
  bookInterest: bigint;
  bookAmFees: bigint;
  taxDepreciation: bigint;
  excessTaxDepreciation: bigint;
  taxableIncomeWorksheet: bigint;
};

export type PartnerRole = "GP" | "LP" | "MEMBER";

export type PartnerInput = {
  code: string;
  name: string;
  role: PartnerRole;
  ownershipBps: number;
  tinLast4?: string | null;
};

export type CapitalActivityInput = {
  partnerCode: string;
  beginningCents: bigint;
  contributionsCents: bigint;
  distributionsCents: bigint;
  bookNiAllocCents: bigint;
};

export type CapitalRollforwardRow = {
  partnerCode: string;
  partnerName: string;
  role: PartnerRole;
  ownershipBps: number;
  tinLast4: string | null;
  beginningCents: bigint;
  contributionsCents: bigint;
  distributionsCents: bigint;
  bookNiAllocCents: bigint;
  endingCents: bigint;
  identityHolds: boolean;
};

export type CapitalRollforward = {
  entityCode: string;
  entityName: string;
  period: string;
  rows: CapitalRollforwardRow[];
  totals: Omit<CapitalRollforwardRow, "partnerCode" | "partnerName" | "role" | "ownershipBps" | "tinLast4">;
  limitations: readonly string[];
  disclaimer: string;
};

export type Form1099Kind = "NEC" | "MISC" | "NONE";

export type VendorInput = {
  code: string;
  name: string;
  form1099: Form1099Kind;
  tinLast4?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type VendorPaymentInput = {
  vendorCode: string;
  entityCode: string;
  year: number;
  month: number;
  amountCents: bigint;
  accountCode: string;
  memo?: string;
  reportable: boolean;
};

export type Form1099ExportRow = {
  vendorCode: string;
  vendorName: string;
  form1099: Form1099Kind;
  tinLast4: string | null;
  entityCode: string;
  period: string;
  accountCode: string;
  amountCents: bigint;
  memo: string;
  reportable: boolean;
};

export type Form1099Export = {
  rows: Form1099ExportRow[];
  totalReportableCents: bigint;
  stub: boolean;
  stubReason: string;
  limitations: readonly string[];
  disclaimer: string;
};

export type SheetCell = string | number | bigint | null;
export type WorkbookSheet = { name: string; rows: SheetCell[][] };
