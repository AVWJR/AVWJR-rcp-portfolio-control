import { MASTER_COA_BY_CODE, cloneMasterCoa } from "./coa";
import type { AccountBalance, AccountDef, PostedLine } from "./types";

export function rollupBalances(
  lines: PostedLine[],
  accounts: AccountDef[] = cloneMasterCoa(),
): AccountBalance[] {
  const byCode = new Map(accounts.map((a) => [a.code, { ...a, debit: 0n, credit: 0n, net: 0n }]));

  for (const line of lines) {
    const row = byCode.get(line.accountCode);
    if (!row) {
      const fallback = MASTER_COA_BY_CODE.get(line.accountCode);
      if (!fallback) {
        throw new Error(`Unknown account ${line.accountCode}`);
      }
      byCode.set(line.accountCode, { ...fallback, debit: 0n, credit: 0n, net: 0n });
    }
    const target = byCode.get(line.accountCode)!;
    target.debit += line.debit;
    target.credit += line.credit;
    target.net = target.debit - target.credit;
  }

  return [...byCode.values()]
    .map((row) => ({ ...row, net: row.debit - row.credit }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function netByGroup(balances: AccountBalance[], group: string): bigint {
  return balances.filter((b) => b.reportGroup === group).reduce((acc, b) => acc + b.net, 0n);
}

export function netByCode(balances: AccountBalance[], code: string): bigint {
  return balances.find((b) => b.code === code)?.net ?? 0n;
}

/** Asset/expense natural sign is debit-credit. Liability/equity/revenue is credit-debit. */
export function statementAmount(row: AccountBalance): bigint {
  if (row.type === "ASSET" || row.type === "EXPENSE") {
    return row.net;
  }
  return -row.net;
}

export function cashBalance(balances: AccountBalance[]): bigint {
  return balances.filter((b) => b.isCash).reduce((acc, b) => acc + b.net, 0n);
}

export function creditMinusDebit(row: AccountBalance): bigint {
  return row.credit - row.debit;
}
