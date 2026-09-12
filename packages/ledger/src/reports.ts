import { cashBalance, netByCode, netByGroup, rollupBalances } from "./balances";
import { cloneMasterCoa } from "./coa";
import {
  ELIMINATION_CODES,
  type AccountDef,
  type BalanceSheet,
  type CashFlowStatement,
  type IncomeStatement,
  type PostedLine,
  type StatementRow,
  type TrialBalanceRow,
} from "./types";

export type ReportInput = {
  accounts?: AccountDef[];
  /** All posted lines through period end (for TB / BS / ending cash). */
  throughEnd: PostedLine[];
  /** Posted lines strictly before period start (for beginning cash / WC). */
  throughStart?: PostedLine[];
  /** Posted lines in the selected period (for IS / CF activity). */
  inPeriod?: PostedLine[];
  /** Drop IC and AM fee pairs (OpCo consolidated presentation). */
  eliminate?: boolean;
};

function applyEliminations(lines: PostedLine[], eliminate?: boolean): PostedLine[] {
  if (!eliminate) return lines;
  const skip = new Set<string>(ELIMINATION_CODES);
  return lines.filter((l) => !skip.has(l.accountCode));
}

function debitNet(balances: ReturnType<typeof rollupBalances>, group: string): bigint {
  return netByGroup(balances, group);
}

function creditNet(balances: ReturnType<typeof rollupBalances>, group: string): bigint {
  return -netByGroup(balances, group);
}

export function buildTrialBalance(input: ReportInput): {
  rows: TrialBalanceRow[];
  totalDebit: bigint;
  totalCredit: bigint;
  balanced: boolean;
} {
  const balances = rollupBalances(
    applyEliminations(input.throughEnd, input.eliminate),
    input.accounts ?? cloneMasterCoa(),
  );
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;

  for (const b of balances) {
    if (b.debit === 0n && b.credit === 0n) continue;
    const net = b.debit - b.credit;
    const debit = net > 0n ? net : 0n;
    const credit = net < 0n ? -net : 0n;
    rows.push({ code: b.code, name: b.name, type: b.type, debit, credit });
    totalDebit += debit;
    totalCredit += credit;
  }

  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export function buildIncomeStatement(input: ReportInput): IncomeStatement {
  const activity = applyEliminations(input.inPeriod ?? input.throughEnd, input.eliminate);
  const balances = rollupBalances(activity, input.accounts ?? cloneMasterCoa());

  const gpr = creditNet(balances, "gpr");
  const vacancy = debitNet(balances, "vacancy");
  const concessions = debitNet(balances, "concessions");
  const otherIncome = creditNet(balances, "other_income");
  const amIncome = creditNet(balances, "am_income");
  const egr = gpr - vacancy - concessions;
  const egi = egr + otherIncome;

  const opexGroups: { key: string; label: string }[] = [
    { key: "opex_payroll", label: "Payroll" },
    { key: "opex_rm", label: "Repairs & Maintenance" },
    { key: "opex_util", label: "Utilities" },
    { key: "opex_contracts", label: "Contract Services" },
    { key: "opex_marketing", label: "Marketing" },
    { key: "opex_admin", label: "Administrative" },
    { key: "opex_ins", label: "Insurance" },
    { key: "opex_tax", label: "Real Estate Taxes" },
    { key: "opex_pm", label: "Property Management Fees" },
    { key: "opex_other", label: "Other Operating Expenses" },
  ];

  const opexRows = opexGroups.map((g) => ({
    key: g.key,
    label: g.label,
    amount: debitNet(balances, g.key),
  }));
  const opex = opexRows.reduce((acc, r) => acc + r.amount, 0n);
  const noi = egi - opex;

  const interest = debitNet(balances, "interest");
  const depreciation = debitNet(balances, "depreciation");
  const amFees = debitNet(balances, "am_fee");
  const netIncome = noi - interest - depreciation - amFees + amIncome;

  const rows: StatementRow[] = [
    { key: "rev", label: "Revenue", amount: null, indent: 0, emphasis: "section" },
    { key: "gpr", label: "Gross Potential Rent", amount: gpr, indent: 1, code: "4010" },
    { key: "vac", label: "Vacancy Loss", amount: -vacancy, indent: 1, code: "4020" },
    { key: "conc", label: "Concessions / Free Rent", amount: -concessions, indent: 1, code: "4030" },
    { key: "egr", label: "Effective Gross Rent", amount: egr, indent: 0, emphasis: "subtotal" },
    { key: "oi", label: "Other Income", amount: otherIncome, indent: 1, code: "4100" },
    { key: "egi", label: "Effective Gross Income", amount: egi, indent: 0, emphasis: "subtotal" },
    { key: "ox", label: "Operating Expenses", amount: null, indent: 0, emphasis: "section" },
    ...opexRows.map((r) => ({
      key: r.key,
      label: r.label,
      amount: r.amount,
      indent: 1,
    })),
    { key: "ox_tot", label: "Total Operating Expenses", amount: opex, indent: 0, emphasis: "subtotal" },
    { key: "noi", label: "Net Operating Income", amount: noi, indent: 0, emphasis: "total" },
    { key: "below", label: "Below NOI", amount: null, indent: 0, emphasis: "section" },
    { key: "int", label: "Interest Expense", amount: interest, indent: 1, code: "6110" },
    { key: "dep", label: "Depreciation Expense", amount: depreciation, indent: 1, code: "6210" },
    { key: "am", label: "Asset Management Fees", amount: amFees, indent: 1, code: "6310" },
  ];

  if (amIncome !== 0n) {
    rows.push({
      key: "ami",
      label: "Asset Management Fee Income",
      amount: amIncome,
      indent: 1,
      code: "7010",
    });
  }

  rows.push({ key: "ni", label: "Net Income", amount: netIncome, indent: 0, emphasis: "total" });

  return {
    rows,
    gpr,
    vacancy,
    concessions,
    otherIncome,
    egi,
    opex,
    noi,
    interest,
    depreciation,
    amFees,
    netIncome,
  };
}

export function buildBalanceSheet(input: ReportInput): BalanceSheet {
  const through = applyEliminations(input.throughEnd, input.eliminate);
  const periodLines = applyEliminations(input.inPeriod ?? [], input.eliminate);
  const balances = rollupBalances(through, input.accounts ?? cloneMasterCoa());
  const periodIs = buildIncomeStatement({ ...input, inPeriod: periodLines, throughEnd: through });

  const cash = cashBalance(balances);
  const ar = debitNet(balances, "ar");
  const prepaid = debitNet(balances, "prepaid");
  const icFrom = debitNet(balances, "ic_from");
  const investment = debitNet(balances, "investment");
  const land = netByCode(balances, "1410");
  const building = netByCode(balances, "1420");
  const bldgImp = netByCode(balances, "1430");
  const site = netByCode(balances, "1440");
  const ffe = netByCode(balances, "1450");
  const accumDep = netByCode(balances, "1490");
  const netPpe = land + building + bldgImp + site + ffe + accumDep;
  const currentAssets = cash + ar + prepaid + icFrom;
  const totalAssets = currentAssets + investment + netPpe;

  const ap = creditNet(balances, "ap");
  const accrual = creditNet(balances, "accrual");
  const prepaidRent = creditNet(balances, "prepaid_rent");
  const deposits = creditNet(balances, "deposits");
  const debtCurrent = creditNet(balances, "debt_current");
  const icTo = creditNet(balances, "ic_to");
  const debtLt = creditNet(balances, "debt_lt");
  const currentLiab = ap + accrual + prepaidRent + deposits + debtCurrent + icTo;
  const totalLiabilities = currentLiab + debtLt;

  const contrib = creditNet(balances, "contrib");
  const distrib = debitNet(balances, "distrib");
  const closedEarnings = creditNet(balances, "re") + creditNet(balances, "ni_close");

  const priorLines = applyEliminations(input.throughStart ?? [], input.eliminate);
  const priorIs = buildIncomeStatement({
    accounts: input.accounts,
    throughEnd: priorLines,
    inPeriod: priorLines,
  });
  const currentNi = periodIs.netIncome;
  const retained = closedEarnings + priorIs.netIncome;
  const totalEquity = contrib - distrib + retained + currentNi;
  const balanced = totalAssets === totalLiabilities + totalEquity;

  const rows: StatementRow[] = [
    { key: "a", label: "Assets", amount: null, indent: 0, emphasis: "section" },
    { key: "ca", label: "Current Assets", amount: null, indent: 0, emphasis: "section" },
    { key: "cash", label: "Cash", amount: cash, indent: 1 },
    { key: "ar", label: "Accounts Receivable, net", amount: ar, indent: 1 },
    { key: "pre", label: "Prepaid Expenses", amount: prepaid, indent: 1 },
    { key: "icf", label: "Due from Related Parties", amount: icFrom, indent: 1 },
    { key: "tca", label: "Total Current Assets", amount: currentAssets, indent: 0, emphasis: "subtotal" },
    { key: "inv", label: "Investment in Subsidiaries", amount: investment, indent: 1 },
    { key: "ppe", label: "Property and Equipment", amount: null, indent: 0, emphasis: "section" },
    { key: "land", label: "Land", amount: land, indent: 1, code: "1410" },
    { key: "bldg", label: "Building", amount: building, indent: 1, code: "1420" },
    { key: "bi", label: "Building Improvements", amount: bldgImp, indent: 1, code: "1430" },
    { key: "site", label: "Site Improvements", amount: site, indent: 1, code: "1440" },
    { key: "ffe", label: "Furniture, Fixtures & Equipment", amount: ffe, indent: 1, code: "1450" },
    { key: "ad", label: "Accumulated Depreciation", amount: accumDep, indent: 1, code: "1490" },
    { key: "nppe", label: "Net Property and Equipment", amount: netPpe, indent: 0, emphasis: "subtotal" },
    { key: "ta", label: "Total Assets", amount: totalAssets, indent: 0, emphasis: "total" },
    { key: "l", label: "Liabilities", amount: null, indent: 0, emphasis: "section" },
    { key: "cl", label: "Current Liabilities", amount: null, indent: 0, emphasis: "section" },
    { key: "ap", label: "Accounts Payable", amount: ap, indent: 1, code: "2010" },
    { key: "acc", label: "Accrued Expenses", amount: accrual, indent: 1, code: "2020" },
    { key: "pr", label: "Prepaid Rent", amount: prepaidRent, indent: 1, code: "2040" },
    { key: "sd", label: "Tenant Security Deposits", amount: deposits, indent: 1, code: "2050" },
    { key: "mc", label: "Current Portion of Mortgage", amount: debtCurrent, indent: 1, code: "2110" },
    { key: "ict", label: "Due to Related Parties", amount: icTo, indent: 1, code: "2310" },
    { key: "tcl", label: "Total Current Liabilities", amount: currentLiab, indent: 0, emphasis: "subtotal" },
    { key: "mlt", label: "Mortgage Payable — Long Term", amount: debtLt, indent: 1, code: "2210" },
    { key: "tl", label: "Total Liabilities", amount: totalLiabilities, indent: 0, emphasis: "total" },
    { key: "e", label: "Members' Equity", amount: null, indent: 0, emphasis: "section" },
    { key: "con", label: "Contributions", amount: contrib, indent: 1, code: "3010" },
    { key: "dis", label: "Distributions", amount: -distrib, indent: 1, code: "3020" },
    { key: "re", label: "Retained Earnings", amount: retained, indent: 1, code: "3100" },
    { key: "cni", label: "Current Period Net Income", amount: currentNi, indent: 1 },
    { key: "te", label: "Total Equity", amount: totalEquity, indent: 0, emphasis: "subtotal" },
    {
      key: "lqe",
      label: "Total Liabilities and Equity",
      amount: totalLiabilities + totalEquity,
      indent: 0,
      emphasis: "total",
    },
  ];

  return { rows, totalAssets, totalLiabilities, totalEquity, balanced };
}

function groupDelta(
  start: ReturnType<typeof rollupBalances>,
  end: ReturnType<typeof rollupBalances>,
  group: string,
): bigint {
  return netByGroup(end, group) - netByGroup(start, group);
}

export function buildCashFlow(input: ReportInput): CashFlowStatement {
  const accounts = input.accounts ?? cloneMasterCoa();
  const startLines = applyEliminations(input.throughStart ?? [], input.eliminate);
  const endLines = applyEliminations(input.throughEnd, input.eliminate);
  const periodLines = applyEliminations(input.inPeriod ?? [], input.eliminate);
  const start = rollupBalances(startLines, accounts);
  const end = rollupBalances(endLines, accounts);
  const period = rollupBalances(periodLines, accounts);
  const is = buildIncomeStatement({ ...input, inPeriod: periodLines, throughEnd: endLines });

  const dep = is.depreciation;
  // Indirect method: −Δ(debit−credit) on every non-cash BS account.
  const dAr = -groupDelta(start, end, "ar");
  const dPrepaid = -groupDelta(start, end, "prepaid");
  const dIcFrom = -groupDelta(start, end, "ic_from");
  const dAp = -groupDelta(start, end, "ap");
  const dAccrual = -groupDelta(start, end, "accrual");
  const dPrepaidRent = -groupDelta(start, end, "prepaid_rent");
  const dDeposits = -groupDelta(start, end, "deposits");
  const dIcTo = -groupDelta(start, end, "ic_to");

  const cfo =
    is.netIncome + dep + dAr + dPrepaid + dIcFrom + dAp + dAccrual + dPrepaidRent + dDeposits + dIcTo;

  const ppeCodes = ["1410", "1420", "1430", "1440", "1450"];
  const capex = ppeCodes.reduce((acc, code) => {
    const s = start.find((b) => b.code === code)?.net ?? 0n;
    const e = end.find((b) => b.code === code)?.net ?? 0n;
    return acc + (e - s);
  }, 0n);
  const dInvestment = (end.find((b) => b.code === "1350")?.net ?? 0n) - (start.find((b) => b.code === "1350")?.net ?? 0n);
  const cfi = -(capex + dInvestment);

  const dDebt = groupDelta(start, end, "debt_current") + groupDelta(start, end, "debt_lt");
  const contrib = creditNet(period, "contrib");
  const distrib = debitNet(period, "distrib");
  const cff = -dDebt + contrib - distrib;

  const beginningCash = cashBalance(start);
  const endingCash = cashBalance(end);
  const netChange = cfo + cfi + cff;
  const tiesToBalanceSheet = beginningCash + netChange === endingCash;

  const rows: StatementRow[] = [
    { key: "op", label: "Cash flows from operating activities", amount: null, indent: 0, emphasis: "section" },
    { key: "ni", label: "Net Income", amount: is.netIncome, indent: 1 },
    { key: "dep", label: "Depreciation", amount: dep, indent: 1 },
    { key: "dar", label: "Change in accounts receivable", amount: dAr, indent: 1 },
    { key: "dpre", label: "Change in prepaid expenses", amount: dPrepaid, indent: 1 },
    { key: "dicf", label: "Change in due from related parties", amount: dIcFrom, indent: 1 },
    { key: "dap", label: "Change in accounts payable", amount: dAp, indent: 1 },
    { key: "dacc", label: "Change in accrued expenses", amount: dAccrual, indent: 1 },
    { key: "dpr", label: "Change in prepaid rent", amount: dPrepaidRent, indent: 1 },
    { key: "dsd", label: "Change in security deposits", amount: dDeposits, indent: 1 },
    { key: "dict", label: "Change in due to related parties", amount: dIcTo, indent: 1 },
    { key: "cfo", label: "Net cash from operating activities", amount: cfo, indent: 0, emphasis: "subtotal" },
    { key: "inv", label: "Cash flows from investing activities", amount: null, indent: 0, emphasis: "section" },
    { key: "capex", label: "Capital expenditures / property additions", amount: -capex, indent: 1 },
    { key: "sub", label: "Investment in subsidiaries", amount: -dInvestment, indent: 1 },
    { key: "cfi", label: "Net cash from investing activities", amount: cfi, indent: 0, emphasis: "subtotal" },
    { key: "fin", label: "Cash flows from financing activities", amount: null, indent: 0, emphasis: "section" },
    { key: "debt", label: "Net change in mortgage principal", amount: -dDebt, indent: 1 },
    { key: "con", label: "Member contributions", amount: contrib, indent: 1 },
    { key: "dis", label: "Member distributions", amount: -distrib, indent: 1 },
    { key: "cff", label: "Net cash from financing activities", amount: cff, indent: 0, emphasis: "subtotal" },
    { key: "nc", label: "Net change in cash", amount: netChange, indent: 0, emphasis: "total" },
    { key: "bc", label: "Cash at beginning of period", amount: beginningCash, indent: 0 },
    { key: "ec", label: "Cash at end of period", amount: endingCash, indent: 0, emphasis: "total" },
  ];

  return { rows, cfo, cfi, cff, netChange, beginningCash, endingCash, tiesToBalanceSheet };
}
