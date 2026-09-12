/** Reporting package. Phase A statements live in @rcp/ledger; Phase B adds the NOI bridge + variance. */

export type StatementKind = "TB" | "IS" | "BS" | "CF" | "OS";

export const PHASE_B_STATEMENTS: StatementKind[] = ["TB", "IS", "OS", "BS", "CF"];

export function statementPath(kind: StatementKind): string {
  const map: Record<StatementKind, string> = {
    TB: "/reports/trial-balance",
    IS: "/reports/income-statement",
    OS: "/reports/operating-statement",
    BS: "/reports/balance-sheet",
    CF: "/reports/cash-flow",
  };
  return map[kind];
}

export * from "./variance";
export * from "./operating-statement";
