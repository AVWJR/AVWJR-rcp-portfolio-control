import {
  OPEX_GROUPS,
  buildIncomeStatement,
  type IncomeStatement,
  type ReportInput,
  type StatementRow,
} from "@rcp/ledger";
import { pairVariance, type VariancePair } from "./variance";

export { OPEX_GROUPS };

/** Budget stored as natural-magnitude cents by CoA code. */
export type BudgetByCode = Map<string, bigint>;

export type OperatingLine = StatementRow & VariancePair & { favorable?: "revenue" | "expense" | null };

export type OperatingStatement = {
  actual: IncomeStatement;
  budget: IncomeStatement | null;
  prior: IncomeStatement | null;
  rows: OperatingLine[];
};

function credit(budget: BudgetByCode | null, code: string): bigint {
  return budget?.get(code) ?? 0n;
}

/**
 * Build a synthetic income statement from budget amounts stored as positive
 * natural-magnitude cents (same sign convention as seed GL: GPR credit, vacancy
 * debit, opex debit). Missing codes are treated as zero.
 */
export function incomeStatementFromBudget(budget: BudgetByCode): IncomeStatement {
  const gpr = credit(budget, "4010");
  const lossToLease = credit(budget, "4015");
  const vacancy = credit(budget, "4020");
  const concessions = credit(budget, "4030");
  const nonRevenueUnits = credit(budget, "4040");
  const badDebt = credit(budget, "4050");
  const otherCodes = ["4100", "4110", "4120", "4130", "4140", "4150", "4160", "4170", "4180", "4190"];
  const otherIncome = otherCodes.reduce((acc, code) => acc + credit(budget, code), 0n);
  const amIncome = credit(budget, "7010");
  const egr = gpr - lossToLease - vacancy - concessions - nonRevenueUnits - badDebt;
  const egi = egr + otherIncome;
  const opex = OPEX_GROUPS.reduce((acc, g) => acc + credit(budget, g.code), 0n);
  const noi = egi - opex;
  const interest = credit(budget, "6110");
  const interestAmort = credit(budget, "6120");
  const depreciation = credit(budget, "6210");
  const otherAmort = credit(budget, "6220");
  const amFees = credit(budget, "6310");
  const entityCosts = credit(budget, "6410");
  const netIncome = noi - amFees - entityCosts - interest - interestAmort - depreciation - otherAmort + amIncome;
  return {
    rows: [],
    gpr,
    lossToLease,
    vacancy,
    concessions,
    nonRevenueUnits,
    badDebt,
    otherIncome,
    egr,
    egi,
    opex,
    noi,
    interest,
    interestAmort,
    depreciation,
    otherAmort,
    amFees,
    entityCosts,
    amIncome,
    netIncome,
  };
}

function line(
  key: string,
  label: string,
  actual: bigint | null,
  budget: bigint | null,
  prior: bigint | null,
  opts: {
    indent?: number;
    emphasis?: StatementRow["emphasis"];
    code?: string;
    favorable?: OperatingLine["favorable"];
  } = {},
): OperatingLine {
  const pair = pairVariance(actual, budget, prior);
  return {
    key,
    label,
    amount: actual,
    indent: opts.indent ?? 0,
    emphasis: opts.emphasis,
    code: opts.code,
    favorable: opts.favorable ?? null,
    ...pair,
  };
}

export function buildOperatingStatement(opts: {
  actual: IncomeStatement;
  budget?: IncomeStatement | null;
  prior?: IncomeStatement | null;
}): OperatingStatement {
  const a = opts.actual;
  const b = opts.budget ?? null;
  const p = opts.prior ?? null;
  const ba = (pick: (s: IncomeStatement) => bigint) => (b ? pick(b) : null);
  const pa = (pick: (s: IncomeStatement) => bigint) => (p ? pick(p) : null);

  const aEgr = a.egr;
  const bEgr = b ? b.egr : null;
  const pEgr = p ? p.egr : null;

  const opexActualByKey = new Map(
    a.rows.filter((r) => r.key.startsWith("opex_")).map((r) => [r.key, r.amount ?? 0n]),
  );
  const opexBudgetByKey = new Map(
    (b?.rows ?? []).filter((r) => r.key.startsWith("opex_")).map((r) => [r.key, r.amount ?? 0n]),
  );
  const opexPriorByKey = new Map(
    (p?.rows ?? []).filter((r) => r.key.startsWith("opex_")).map((r) => [r.key, r.amount ?? 0n]),
  );

  const rows: OperatingLine[] = [
    line("rev", "Revenue", null, null, null, { emphasis: "section" }),
    line("gpr", "Gross Potential Rent", a.gpr, ba((s) => s.gpr), pa((s) => s.gpr), {
      indent: 1,
      code: "4010",
      favorable: "revenue",
    }),
    line("ltl", "Loss/Gain to Lease", -a.lossToLease, b ? -b.lossToLease : null, p ? -p.lossToLease : null, {
      indent: 1,
      code: "4015",
      favorable: "revenue",
    }),
    line("vac", "Vacancy Loss", -a.vacancy, b ? -b.vacancy : null, p ? -p.vacancy : null, {
      indent: 1,
      code: "4020",
      favorable: "revenue",
    }),
    line("conc", "Concessions / Free Rent", -a.concessions, b ? -b.concessions : null, p ? -p.concessions : null, {
      indent: 1,
      code: "4030",
      favorable: "revenue",
    }),
    line("nru", "Non-Revenue Units", -a.nonRevenueUnits, b ? -b.nonRevenueUnits : null, p ? -p.nonRevenueUnits : null, {
      indent: 1,
      code: "4040",
      favorable: "revenue",
    }),
    line("bd", "Bad Debt, net of Recoveries", -a.badDebt, b ? -b.badDebt : null, p ? -p.badDebt : null, {
      indent: 1,
      code: "4050",
      favorable: "revenue",
    }),
    line("egr", "Net Rental Income", aEgr, bEgr, pEgr, { emphasis: "subtotal" }),
    line("oi", "Other Income", a.otherIncome, ba((s) => s.otherIncome), pa((s) => s.otherIncome), {
      indent: 1,
      code: "4100",
      favorable: "revenue",
    }),
    line("egi", "Effective Gross Income", a.egi, ba((s) => s.egi), pa((s) => s.egi), { emphasis: "subtotal" }),
    line("ox", "Operating Expenses", null, null, null, { emphasis: "section" }),
    ...OPEX_GROUPS.map((g) =>
      line(
        g.key,
        g.label,
        opexActualByKey.get(g.key) ?? 0n,
        b ? (opexBudgetByKey.get(g.key) ?? 0n) : null,
        p ? (opexPriorByKey.get(g.key) ?? 0n) : null,
        { indent: 1, code: g.code, favorable: "expense" },
      ),
    ),
    line("ox_tot", "Total Operating Expenses", a.opex, ba((s) => s.opex), pa((s) => s.opex), {
      emphasis: "subtotal",
      favorable: "expense",
    }),
    line("noi", "Net Operating Income", a.noi, ba((s) => s.noi), pa((s) => s.noi), {
      emphasis: "total",
      favorable: "revenue",
    }),
    line("below", "Below NOI", null, null, null, { emphasis: "section" }),
    line("am", "Asset Management Fees", a.amFees, ba((s) => s.amFees), pa((s) => s.amFees), {
      indent: 1,
      code: "6310",
      favorable: "expense",
    }),
    line("ent", "Partnership / Entity-Level Costs", a.entityCosts, ba((s) => s.entityCosts), pa((s) => s.entityCosts), {
      indent: 1,
      code: "6410",
      favorable: "expense",
    }),
    line("int", "Interest Expense", a.interest, ba((s) => s.interest), pa((s) => s.interest), {
      indent: 1,
      code: "6110",
      favorable: "expense",
    }),
    line("iam", "Amortization of Debt Issuance Costs", a.interestAmort, ba((s) => s.interestAmort), pa((s) => s.interestAmort), {
      indent: 1,
      code: "6120",
      favorable: "expense",
    }),
    line("dep", "Depreciation Expense", a.depreciation, ba((s) => s.depreciation), pa((s) => s.depreciation), {
      indent: 1,
      code: "6210",
      favorable: "expense",
    }),
  ];

  if (a.amIncome !== 0n || (b?.amIncome ?? 0n) !== 0n) {
    rows.push(
      line("ami", "Asset Management Fee Income", a.amIncome, b ? b.amIncome : null, p ? p.amIncome : null, {
        indent: 1,
        code: "7010",
        favorable: "revenue",
      }),
    );
  }

  rows.push(
    line("ni", "Net Income", a.netIncome, ba((s) => s.netIncome), pa((s) => s.netIncome), {
      emphasis: "total",
      favorable: "revenue",
    }),
  );

  return { actual: a, budget: b, prior: p, rows };
}

export function operatingStatementFromReports(opts: {
  actualInput: ReportInput;
  budget?: BudgetByCode | null;
  priorInput?: ReportInput | null;
}): OperatingStatement {
  const actual = buildIncomeStatement(opts.actualInput);
  let budget: IncomeStatement | null = null;
  if (opts.budget && opts.budget.size > 0) {
    budget = incomeStatementFromBudget(opts.budget);
    // Rebuild opex rows so per-line variance works.
    budget.rows = OPEX_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      amount: opts.budget!.get(g.code) ?? 0n,
      indent: 1,
    }));
    if ((opts.budget.get("7010") ?? 0n) !== 0n) {
      budget.rows.push({
        key: "ami",
        label: "Asset Management Fee Income",
        amount: opts.budget.get("7010") ?? 0n,
        indent: 1,
        code: "7010",
      });
    }
  }
  const prior = opts.priorInput ? buildIncomeStatement(opts.priorInput) : null;
  return buildOperatingStatement({ actual, budget, prior });
}
