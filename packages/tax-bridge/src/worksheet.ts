import { estimateMonthlyMacrs } from "./macrs";
import {
  TAX_FILING_DISCLAIMER,
  type BookTaxSource,
  type BooksToTaxWorksheet,
  type PpeBases,
  type TaxAdjustmentInput,
  type TaxWorksheetLine,
} from "./types";

export type BuildWorksheetInput = {
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel?: string;
  book: BookTaxSource;
  ppe: PpeBases;
  extraAdjustments?: TaxAdjustmentInput[];
};

function adj(books: bigint, tax: bigint): bigint {
  return tax - books;
}

export function buildBooksToTaxWorksheet(input: BuildWorksheetInput): BooksToTaxWorksheet {
  const { book, ppe } = input;
  const macrs = estimateMonthlyMacrs(ppe);
  const extra = input.extraAdjustments ?? [];

  const lines: TaxWorksheetLine[] = [
    {
      key: "book_ni",
      kind: "book_ni",
      label: "Book net income (period)",
      basis: "BOOKS",
      booksCents: book.netIncome,
      taxCents: book.netIncome,
      adjustmentCents: 0n,
      notes: "From the book income statement. AM fees remain below NOI. Not taxable income.",
    },
    {
      key: "book_dep",
      kind: "book_dep",
      label: "Book depreciation (6210)",
      basis: "BOOKS",
      booksCents: book.depreciation,
      taxCents: book.depreciation,
      adjustmentCents: 0n,
      accountCode: "6210",
      notes: "Book SL depreciation posted to 6210 / 1490.",
    },
    {
      key: "book_interest",
      kind: "book_interest",
      label: "Book interest expense (6110)",
      basis: "BOOKS",
      booksCents: book.interest,
      taxCents: book.interest,
      adjustmentCents: 0n,
      accountCode: "6110",
      notes: "Book interest below NOI. 163(j) is a tax hook only — see TAX line.",
    },
    {
      key: "book_am_fees",
      kind: "book_am_fees",
      label: "Book asset management fees (6310, below NOI)",
      basis: "BOOKS",
      booksCents: book.amFees,
      taxCents: book.amFees,
      adjustmentCents: 0n,
      accountCode: "6310",
      notes: "Locked policy: AM sits below NOI on the SPE. Combined roll-up eliminates 6310/7010.",
    },
    {
      key: "book_am_income",
      kind: "book_am_income",
      label: "Book AM fee income (7010)",
      basis: "BOOKS",
      booksCents: book.amIncome,
      taxCents: book.amIncome,
      adjustmentCents: 0n,
      accountCode: "7010",
      notes: "OpCo reciprocal of SPE 6310. Eliminated on combined roll-up.",
    },
    {
      key: "tax_dep_macrs",
      kind: "tax_dep_macrs",
      label: "Tax depreciation (MACRS lives hook)",
      basis: "TAX",
      booksCents: book.depreciation,
      taxCents: macrs.taxDepreciation,
      adjustmentCents: adj(book.depreciation, macrs.taxDepreciation),
      macrsClass: "mixed — see MACRS columns",
      notes: "Straight-line monthly hook from PPE cost bases. Not bonus, §179, or mid-quarter MACRS.",
    },
    {
      key: "tax_interest_163j",
      kind: "tax_interest_163j",
      label: "Tax interest after 163(j) hook",
      basis: "TAX",
      booksCents: book.interest,
      taxCents: book.interest,
      adjustmentCents: 0n,
      accountCode: "6110",
      notes: "No 163(j) limitation computed in this demo. Column reserved for CPA overlay.",
    },
  ];

  for (const col of macrs.columns) {
    lines.push({
      key: `macrs_${col.assetClass}`,
      kind: "tax_dep_macrs",
      label: `MACRS — ${col.label}`,
      basis: "TAX",
      booksCents: 0n,
      taxCents: col.taxDepCents,
      adjustmentCents: col.taxDepCents,
      macrsClass: col.assetClass,
      macrsLifeYears: col.recoveryYears,
      accountCode: col.accountCode ?? undefined,
      notes: `Basis ${col.accountCode ?? "n/a"} · ${col.convention} · ${col.notes}`,
    });
  }

  let extraBridge = 0n;
  for (const row of extra) {
    const adjustmentCents = adj(row.booksCents, row.taxCents);
    extraBridge += adjustmentCents;
    lines.push({
      key: row.lineCode,
      kind: "adjustment",
      label: row.label,
      basis: row.basis,
      booksCents: row.booksCents,
      taxCents: row.taxCents,
      adjustmentCents,
      notes: row.notes,
    });
  }

  const excessTaxDepreciation = adj(book.depreciation, macrs.taxDepreciation);
  // Extra tax depreciation increases the tax deduction → lowers worksheet taxable income.
  const taxableIncomeWorksheet = book.netIncome - excessTaxDepreciation + extraBridge;

  lines.push({
    key: "taxable_income_worksheet",
    kind: "taxable_income_worksheet",
    label: "Taxable income (CPA worksheet)",
    basis: "BRIDGE",
    booksCents: book.netIncome,
    taxCents: taxableIncomeWorksheet,
    adjustmentCents: adj(book.netIncome, taxableIncomeWorksheet),
    notes: "Book NI − (tax dep − book dep) ± seeded adjustments. Not a filed return line.",
  });

  return {
    entityCode: input.entityCode,
    entityName: input.entityName,
    period: input.period,
    viewLabel: input.viewLabel ?? "Standalone legal entity — not a tax consolidation",
    disclaimer: TAX_FILING_DISCLAIMER,
    lines,
    bookNetIncome: book.netIncome,
    bookDepreciation: book.depreciation,
    bookInterest: book.interest,
    bookAmFees: book.amFees,
    taxDepreciation: macrs.taxDepreciation,
    excessTaxDepreciation,
    taxableIncomeWorksheet,
  };
}

export function worksheetIdentityHolds(ws: BooksToTaxWorksheet): boolean {
  return ws.taxableIncomeWorksheet === ws.bookNetIncome - ws.excessTaxDepreciation + extraBridgeFrom(ws);
}

function extraBridgeFrom(ws: BooksToTaxWorksheet): bigint {
  return ws.lines
    .filter((l) => l.kind === "adjustment")
    .reduce((acc, l) => acc + l.adjustmentCents, 0n);
}

export function everyLineLabeled(ws: BooksToTaxWorksheet): boolean {
  return ws.lines.length > 0 && ws.lines.every((l) => l.basis === "BOOKS" || l.basis === "TAX" || l.basis === "BRIDGE");
}
