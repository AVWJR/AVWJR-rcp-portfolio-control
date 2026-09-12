import { ELIMINATION_CODES } from "@rcp/ledger";
import { parseBudgetCsv, serializeBudgetCsv, type BudgetCsvRow } from "@rcp/properties";
import type { BudgetByCode } from "@rcp/reporting";
import { assertReplaceConfirmed } from "./import-guard";
import { prisma } from "./prisma";

export async function loadBudgetMap(opts: {
  entityIds: string[];
  year: number;
  month: number;
  eliminate?: boolean;
}): Promise<BudgetByCode> {
  const rows = await prisma.budgetLine.findMany({
    where: { entityId: { in: opts.entityIds }, year: opts.year, month: opts.month },
  });
  const map: BudgetByCode = new Map();
  const skip = new Set<string>(opts.eliminate ? ELIMINATION_CODES : []);
  for (const row of rows) {
    if (skip.has(row.accountCode)) continue;
    map.set(row.accountCode, (map.get(row.accountCode) ?? 0n) + row.amount);
  }
  return map;
}

export async function replaceBudget(opts: {
  entityId: string;
  year: number;
  month: number;
  rows: BudgetCsvRow[];
  source?: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.budgetLine.deleteMany({
      where: { entityId: opts.entityId, year: opts.year, month: opts.month },
    });
    if (opts.rows.length === 0) return;
    await tx.budgetLine.createMany({
      data: opts.rows.map((row) => ({
        entityId: opts.entityId,
        year: opts.year,
        month: opts.month,
        accountCode: row.accountCode,
        amount: row.amount,
        source: opts.source ?? "import",
      })),
    });
  });
  return opts.rows.length;
}

export async function importBudgetCsv(opts: {
  entityId: string;
  year: number;
  month: number;
  csv: string;
  source?: string;
  confirmReplace?: boolean;
}) {
  const existingCount = await prisma.budgetLine.count({
    where: { entityId: opts.entityId, year: opts.year, month: opts.month },
  });
  assertReplaceConfirmed({ existingCount, confirmReplace: opts.confirmReplace, kind: "budget" });
  const rows = parseBudgetCsv(opts.csv);
  await replaceBudget({ ...opts, rows });
  return rows;
}

export async function exportBudgetCsv(opts: {
  entityId: string;
  year: number;
  month: number;
}): Promise<string> {
  const rows = await prisma.budgetLine.findMany({
    where: { entityId: opts.entityId, year: opts.year, month: opts.month },
    orderBy: { accountCode: "asc" },
  });
  return serializeBudgetCsv(rows.map((r) => ({ accountCode: r.accountCode, amount: r.amount })));
}
