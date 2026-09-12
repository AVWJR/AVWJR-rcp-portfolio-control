import { netByCode, rollupBalances } from "./balances";
import { cloneMasterCoa } from "./coa";
import type { PostedLine } from "./types";

export type IcEntityNet = {
  code: string;
  type: string;
  dueFrom: bigint;
  dueTo: bigint;
  amExpense: bigint;
  amIncome: bigint;
};

export type IntercompanyReview = {
  entities: IcEntityNet[];
  speDueTo: bigint;
  opcoDueFrom: bigint;
  speAmExpense: bigint;
  opcoAmIncome: bigint;
  icMatched: boolean;
  amMatched: boolean;
  ok: boolean;
  findings: string[];
};

/**
 * Combined roll-up eliminates 1310/2310/6310/7010. It is not a GAAP consolidation
 * (no NCI, no HoldCo 1350 elimination, no push-down). Unmatched IC is a hard fail.
 */
export function reviewIntercompany(
  entities: { code: string; type: string; lines: PostedLine[] }[],
): IntercompanyReview {
  const rows: IcEntityNet[] = entities.map((entity) => {
    const balances = rollupBalances(entity.lines, cloneMasterCoa());
    return {
      code: entity.code,
      type: entity.type,
      dueFrom: netByCode(balances, "1310"),
      dueTo: -netByCode(balances, "2310"),
      amExpense: netByCode(balances, "6310"),
      amIncome: -netByCode(balances, "7010"),
    };
  });

  const spes = rows.filter((r) => r.type === "SPE");
  const opcos = rows.filter((r) => r.type === "OPCO");
  const speDueTo = spes.reduce((acc, r) => acc + r.dueTo, 0n);
  const opcoDueFrom = opcos.reduce((acc, r) => acc + r.dueFrom, 0n);
  const speAmExpense = spes.reduce((acc, r) => acc + r.amExpense, 0n);
  const opcoAmIncome = opcos.reduce((acc, r) => acc + r.amIncome, 0n);

  const findings: string[] = [];
  const icMatched = speDueTo === opcoDueFrom;
  const amMatched = speAmExpense === opcoAmIncome;
  if (!icMatched) {
    findings.push(
      `Unmatched IC: SPE 2310 ${speDueTo.toString()} ≠ OpCo 1310 ${opcoDueFrom.toString()}`,
    );
  }
  if (!amMatched) {
    findings.push(
      `Unmatched AM fee: SPE 6310 ${speAmExpense.toString()} ≠ OpCo 7010 ${opcoAmIncome.toString()}`,
    );
  }

  return {
    entities: rows,
    speDueTo,
    opcoDueFrom,
    speAmExpense,
    opcoAmIncome,
    icMatched,
    amMatched,
    ok: icMatched && amMatched,
    findings,
  };
}

export const COMBINED_ROLLUP_NOTE =
  "OpCo multi-SPE view is a combined roll-up: it stacks wholly owned SPEs and eliminates IC 1310/2310 and AM 6310/7010. It is not a GAAP consolidation (HoldCo investment 1350, equity, and NCI are not eliminated).";
