/**
 * Books-to-tax worksheets, MACRS lives hooks, partner capital / K-1-oriented
 * exports, and 1099 vendor hooks. Supports CPA prep. Does not file returns.
 */

export {
  FORM_1099_LIMITATIONS,
  K1_EXPORT_LIMITATIONS,
  TAX_BRIDGE_STATUS,
  TAX_FILING_DISCLAIMER,
} from "./types";
export type {
  BasisLabel,
  BookTaxSource,
  BooksToTaxWorksheet,
  CapitalActivityInput,
  CapitalRollforward,
  CapitalRollforwardRow,
  Form1099Export,
  Form1099ExportRow,
  Form1099Kind,
  MacrsLifeHook,
  PartnerInput,
  PartnerRole,
  PpeBases,
  SheetCell,
  TaxAdjustmentInput,
  TaxWorksheetLine,
  VendorInput,
  VendorPaymentInput,
  WorkbookSheet,
} from "./types";

export { estimateMonthlyMacrs, MACRS_LIFE_HOOKS, macrsHookByAccount, monthlyStraightLineCents } from "./macrs";
export type { MacrsColumn } from "./macrs";

export { buildBooksToTaxWorksheet, everyLineLabeled, worksheetIdentityHolds } from "./worksheet";
export { allocateByBps, buildCapitalRollforward, endingCapital } from "./capital";
export { AP_VENDOR_STUB, build1099Export } from "./vendors";
export {
  capitalToSheets,
  form1099ToSheets,
  sheetsToExcelXml,
  sheetToCsv,
  worksheetToSheets,
} from "./export";
