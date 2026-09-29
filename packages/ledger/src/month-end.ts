import { MASTER_COA_BY_CODE } from "./coa";
import type { JournalDraftLine } from "./types";

export type ImportAmount = {
  accountCode: string;
  /** Natural magnitude, except 4015 where positive is loss and negative is gain-to-lease. */
  signedCents: bigint;
  memo?: string;
};

const CONTRA_REVENUE = new Set(["4015", "4020", "4030", "4040", "4050"]);

function line(accountCode: string, debit: bigint, credit: bigint, memo?: string): JournalDraftLine {
  return { accountCode, debit, credit, memo };
}

/**
 * Turn a mapped income-statement import into a balanced journal.
 * Revenue offsets to tenant AR (1110). Expenses offset to AP (2010).
 * Unmapped amounts sit on 1999 and block a hard close until they are mapped.
 */
export function incomeStatementJournal(rows: ImportAmount[]): JournalDraftLine[] {
  const out: JournalDraftLine[] = [];
  for (const row of rows) {
    if (row.signedCents === 0n) continue;
    const account = MASTER_COA_BY_CODE.get(row.accountCode);
    const code = account ? row.accountCode : "1999";
    const amount = row.signedCents < 0n ? -row.signedCents : row.signedCents;
    const negative = row.signedCents < 0n;
    if (!account || code === "1999") {
      out.push(line("1999", negative ? 0n : amount, negative ? amount : 0n, row.memo));
      out.push(line("2010", negative ? amount : 0n, negative ? 0n : amount, row.memo));
      continue;
    }
    if (account.type === "REVENUE" && (account.isContra || CONTRA_REVENUE.has(code))) {
      if (negative) {
        out.push(line(code, 0n, amount, row.memo));
        out.push(line("1110", amount, 0n, row.memo));
      } else {
        out.push(line(code, amount, 0n, row.memo));
        out.push(line("1110", 0n, amount, row.memo));
      }
      continue;
    }
    if (account.type === "REVENUE") {
      out.push(line(code, negative ? amount : 0n, negative ? 0n : amount, row.memo));
      out.push(line("1110", negative ? 0n : amount, negative ? amount : 0n, row.memo));
      continue;
    }
    if (account.type === "EXPENSE") {
      out.push(line(code, negative ? 0n : amount, negative ? amount : 0n, row.memo));
      out.push(line("2010", negative ? amount : 0n, negative ? 0n : amount, row.memo));
      continue;
    }
    out.push(line("1999", amount, 0n, row.memo ?? code));
    out.push(line("2010", 0n, amount, row.memo));
  }
  return out;
}

/** Delta journal that moves current balance-sheet nets onto an imported ending trial balance. */
export function balanceSheetDeltaJournal(
  currentNet: Map<string, bigint>,
  desiredNet: Map<string, bigint>,
): JournalDraftLine[] {
  const codes = new Set<string>([...currentNet.keys(), ...desiredNet.keys()]);
  const out: JournalDraftLine[] = [];
  let imbalance = 0n;
  for (const code of codes) {
    const account = MASTER_COA_BY_CODE.get(code);
    if (!account || account.type === "REVENUE" || account.type === "EXPENSE") continue;
    const delta = (desiredNet.get(code) ?? 0n) - (currentNet.get(code) ?? 0n);
    if (delta === 0n) continue;
    if (delta > 0n) out.push(line(code, delta, 0n, "Month-end balance sheet"));
    else out.push(line(code, 0n, -delta, "Month-end balance sheet"));
    imbalance += delta;
  }
  if (imbalance !== 0n) {
    if (imbalance > 0n) out.push(line("1999", 0n, imbalance, "Balance sheet import plug"));
    else out.push(line("1999", -imbalance, 0n, "Balance sheet import plug"));
  }
  return out;
}

export function journalBalances(lines: JournalDraftLine[]): boolean {
  const debit = lines.reduce((acc, row) => acc + row.debit, 0n);
  const credit = lines.reduce((acc, row) => acc + row.credit, 0n);
  return debit === credit;
}
