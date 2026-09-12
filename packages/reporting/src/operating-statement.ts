import {
  buildIncomeStatement,
  type IncomeStatement,
  type ReportInput,
  type StatementRow,
} from "@rcp/ledger";
import { pairVariance, type VariancePair } from "./variance";

export const OPEX_GROUPS: { key: string; label: string; code: string }[] = [
  { key: "opex_payroll", label: "Payroll", code: "5110" },
  { key: "opex_rm", label: "Repairs & Maintenance", code: "5210" },
  { key: "opex_util", label: "Utilities", code: "5310" },
  { key: "opex_contracts", label: "Contract Services", code: "5410" },
  { key: "opex_marketing", label: "Marketing", code: "5510" },
  { key: "opex_admin", label: "Administrative", code: "5610" },
  { key: "opex_ins", label: "Insurance", code: "5710" },
  { key: "opex_tax", label: "Real Estate Taxes", code: "5810" },
  { key: "opex_pm", label: "Property Management Fees", code: "5910" },
  { key: "opex_other", label: "Other Operating Expenses", code: "5990" },
];

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
  const vacancy = credit(budget, "4020");
  const concessions = credit(budget, "4030");
  const otherIncome = credit(budget, "4100");
  const amIncome = credit(budget, "7010");
  const egr = gpr - vacancy - concessions;
  const egi = egr + otherIncome;
  const opex = OPEX_GROUPS.reduce((acc, g) => acc + credit(budget, g.code), 0n);
  const noi = egi - opex;
  const interest = credit(budget, "6110");
  const depreciation = credit(budget, "6210");
  const amFees = credit(budget, "6310");
  const netIncome = noi - interest - depreciation - amFees + amIncome;
  return {
    rows: [],
    gpr,
    vacancy,
    concessions,
    otherIncome,
    egr,
    egi,
    opex,
    noi,
    interest,
    depreciation,
    amFees,
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
    line("egr", "Effective Gross Rent", aEgr, bEgr, pEgr, { emphasis: "subtotal" }),
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
    line("int", "Interest Expense", a.interest, ba((s) => s.interest), pa((s) => s.interest), {
      indent: 1,
      code: "6110",
      favorable: "expense",
    }),
    line("dep", "Depreciation Expense", a.depreciation, ba((s) => s.depreciation), pa((s) => s.depreciation), {
      indent: 1,
      code: "6210",
      favorable: "expense",
    }),
    line("am", "Asset Management Fees", a.amFees, ba((s) => s.amFees), pa((s) => s.amFees), {
      indent: 1,
      code: "6310",
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
