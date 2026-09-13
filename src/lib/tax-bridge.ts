import {
  buildBooksToTaxWorksheet,
  type BooksToTaxWorksheet,
  type PpeBases,
  type TaxAdjustmentInput,
} from "@rcp/tax-bridge";
import { buildIncomeStatement, netByCode, rollupBalances } from "@rcp/ledger";
import { prisma } from "./prisma";
import { resolveReportScope } from "./reports-server";

function ppeFromBalances(throughEnd: { accountCode: string; debit: bigint; credit: bigint }[]): PpeBases {
  const balances = rollupBalances(throughEnd);
  const debitNet = (code: string) => {
    const n = netByCode(balances, code);
    return n < 0n ? 0n : n;
  };
  return {
    land: debitNet("1410"),
    building: debitNet("1420"),
    improvements: debitNet("1430"),
    site: debitNet("1440"),
    ffe: debitNet("1450"),
    cip: debitNet("1460"),
  };
}

export async function loadBooksToTaxWorksheet(opts: {
  entityId: string;
  year: number;
  month: number;
  consolidated: boolean;
}): Promise<BooksToTaxWorksheet> {
  const scope = await resolveReportScope(opts);
  const is = buildIncomeStatement({
    throughEnd: scope.throughEnd,
    inPeriod: scope.inPeriod,
    eliminate: scope.consolidated,
  });
  const extras = await prisma.taxAdjustment.findMany({
    where: { entityId: scope.entity.id, year: opts.year, month: opts.month },
    orderBy: { lineCode: "asc" },
  });
  const extraAdjustments: TaxAdjustmentInput[] = extras.map((row) => ({
    lineCode: row.lineCode,
    label: row.label,
    basis: row.basis === "TAX" || row.basis === "BOOKS" ? row.basis : "BRIDGE",
    booksCents: row.booksCents,
    taxCents: row.taxCents,
    notes: row.notes ?? undefined,
  }));
  return buildBooksToTaxWorksheet({
    entityCode: scope.entity.code,
    entityName: scope.entity.name,
    period: `${opts.year}-${String(opts.month).padStart(2, "0")}`,
    viewLabel: scope.consolidated
      ? "Combined roll-up — not a tax consolidation and not a GAAP consolidation"
      : "Standalone legal entity — not a tax consolidation",
    book: {
      netIncome: is.netIncome,
      depreciation: is.depreciation,
      interest: is.interest,
      amFees: is.amFees,
      amIncome: is.amIncome,
    },
    ppe: ppeFromBalances(scope.throughEnd),
    extraAdjustments,
  });
}
