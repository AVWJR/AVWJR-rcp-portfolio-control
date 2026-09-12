/** Reporting package. Phase A statements live in @rcp/ledger; this stub is the future packager. */

export type StatementKind = "TB" | "IS" | "BS" | "CF";

export const PHASE_A_STATEMENTS: StatementKind[] = ["TB", "IS", "BS", "CF"];

// TODO(Phase D): packaged PDF/Excel, variance to budget, T-12 vs T-3
// TODO(Phase E): investor pack, lender pack
export function statementPath(kind: StatementKind): string {
  const map: Record<StatementKind, string> = {
    TB: "/reports/trial-balance",
    IS: "/reports/income-statement",
    BS: "/reports/balance-sheet",
    CF: "/reports/cash-flow",
  };
  return map[kind];
}
