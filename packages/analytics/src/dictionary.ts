/**
 * Live RCP Ratio Dictionary. Computational source of truth — keep in lockstep
 * with docs/RCP_RATIO_DICTIONARY_STUB.md. Formulas are implemented in formulas.ts
 * and Phase B/C occupancy / covenant helpers.
 */

import type { RatioDefinition, RatioId } from "./types";
import { RATIO_IDS } from "./types";

export const RATIO_DICTIONARY: RatioDefinition[] = [
  {
    id: "noi_period",
    label: "NOI (period)",
    formula: "EGI − in-NOI OpEx",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "A",
    description:
      "Selected-month book NOI. Asset management fees (6310) sit below this line and are excluded. Not T12.",
    contributors: [
      { kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" },
      { kind: "account", code: "4020", label: "Vacancy Loss", statement: "os" },
      { kind: "account", code: "4030", label: "Concessions / Free Rent", statement: "os" },
      { kind: "account", code: "4100", label: "Other Income", statement: "os" },
      { kind: "account", code: "5110", label: "Payroll", statement: "os" },
      { kind: "account", code: "5210", label: "Repairs & Maintenance", statement: "os" },
      { kind: "account", code: "5310", label: "Utilities", statement: "os" },
      { kind: "account", code: "5410", label: "Contract Services", statement: "os" },
      { kind: "account", code: "5510", label: "Marketing", statement: "os" },
      { kind: "account", code: "5610", label: "Administrative", statement: "os" },
      { kind: "account", code: "5710", label: "Insurance", statement: "os" },
      { kind: "account", code: "5810", label: "Real Estate Taxes", statement: "os" },
      { kind: "account", code: "5910", label: "Property Management Fees", statement: "os" },
      { kind: "account", code: "5990", label: "Other Operating Expenses", statement: "os" },
    ],
  },
  {
    id: "noi_t12",
    label: "NOI (T12)",
    formula: "Σ period NOI of the last 12 months",
    unit: "usd_cents",
    noiDefinition: "t12",
    source: "gl",
    status: "incomplete",
    phase: "D",
    description:
      "True trailing-twelve requires 12 months of operating activity. The demo seed has one operating month (2026-08); July is opening balances only. Incomplete T12 is shown with months-available — it is not annualized.",
    contributors: [{ kind: "account", code: "NOI", label: "Each month's period NOI", statement: "os" }],
  },
  {
    id: "noi_annualized",
    label: "NOI (annualized period)",
    formula: "Period NOI × 12",
    unit: "usd_cents",
    noiDefinition: "annualized_period",
    source: "gl",
    status: "ready",
    phase: "C",
    description:
      "Used only as the debt-yield numerator. Labeled annualized period NOI — never T12.",
    contributors: [{ kind: "account", code: "NOI", label: "Period NOI × 12", statement: "os" }],
  },
  {
    id: "noi_per_unit",
    label: "NOI / unit",
    formula: "Period NOI ÷ SPE unit count",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "D",
    description:
      "Denominator is the SPE unit master count (including DOWN). Not occupied units.",
    contributors: [
      { kind: "account", code: "NOI", label: "Period NOI", statement: "os" },
      { kind: "entity", field: "unitCount", label: "SPE unit count" },
    ],
  },
  {
    id: "egi",
    label: "Effective Gross Income",
    formula: "GPR − vacancy − concessions + other income",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "A",
    description: "Book EGI for the selected period.",
    contributors: [
      { kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" },
      { kind: "account", code: "4020", label: "Vacancy Loss", statement: "os" },
      { kind: "account", code: "4030", label: "Concessions / Free Rent", statement: "os" },
      { kind: "account", code: "4100", label: "Other Income", statement: "os" },
    ],
  },
  {
    id: "gpr",
    label: "Gross Potential Rent",
    formula: "GL 4010 period credit-net",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "A",
    description: "Book GPR. Rent-roll market rent of rentable units is the unit-file analog.",
    contributors: [{ kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" }],
  },
  {
    id: "opex_ratio",
    label: "OpEx ratio",
    formula: "In-NOI OpEx ÷ EGI",
    unit: "bps",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "D",
    description: "Total in-NOI operating expenses over EGI. AM fees excluded.",
    contributors: [
      { kind: "account", code: "OX", label: "Total Operating Expenses", statement: "os" },
      { kind: "account", code: "EGI", label: "Effective Gross Income", statement: "os" },
    ],
  },
  {
    id: "controllable_opex",
    label: "Controllable OpEx",
    formula: "5110 + 5210 + 5310 + 5410 + 5510 + 5610 + 5990",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "D",
    description:
      "Tagged controllable: payroll, R&M, utilities, contracts, marketing, admin, other. Non-controllable: insurance 5710 and RE taxes 5810. PM fees 5910 are contractual and excluded from this tag.",
    contributors: [
      { kind: "account", code: "5110", label: "Payroll (controllable)", statement: "os" },
      { kind: "account", code: "5210", label: "Repairs & Maintenance (controllable)", statement: "os" },
      { kind: "account", code: "5310", label: "Utilities (controllable)", statement: "os" },
      { kind: "account", code: "5410", label: "Contract Services (controllable)", statement: "os" },
      { kind: "account", code: "5510", label: "Marketing (controllable)", statement: "os" },
      { kind: "account", code: "5610", label: "Administrative (controllable)", statement: "os" },
      { kind: "account", code: "5990", label: "Other Operating Expenses (controllable)", statement: "os" },
    ],
  },
  {
    id: "controllable_opex_ratio",
    label: "Controllable OpEx ratio",
    formula: "Controllable OpEx ÷ EGI",
    unit: "bps",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "D",
    description: "Same controllable tag set over book EGI.",
    contributors: [
      { kind: "account", code: "CTL", label: "Controllable OpEx", statement: "os" },
      { kind: "account", code: "EGI", label: "Effective Gross Income", statement: "os" },
    ],
  },
  {
    id: "cash",
    label: "Cash",
    formula: "1010 + 1020 + 1030 + 1040",
    unit: "usd_cents",
    noiDefinition: null,
    source: "gl",
    status: "ready",
    phase: "A",
    description:
      "As-of cash: operating, replacement reserve, escrow, and security-deposit accounts. On OpCo, when a deal waterfall is saved, this tile is RCP/GP cash after waterfall — not gross SPE cash as if wholly owned.",
    contributors: [
      { kind: "account", code: "1010", label: "Cash — Operating", statement: "bs" },
      { kind: "account", code: "1020", label: "Cash — Replacement Reserve", statement: "bs" },
      { kind: "account", code: "1030", label: "Cash — Escrow / Impound", statement: "bs" },
      { kind: "account", code: "1040", label: "Cash — Security Deposits", statement: "bs" },
    ],
  },
  {
    id: "capex_vs_reserves",
    label: "CapEx vs reserves",
    formula: "Period PPE additions (1420–1460) vs GL 1020 vs loan reserve requirement",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "C",
    description:
      "Period CapEx proxy is the net increase in 1420–1460 (CIP spend and direct-to-asset). Place-in-service nets to zero. Reserve cash is GL 1020. Requirement is the loan-file monthly target.",
    contributors: [
      { kind: "account", code: "1460", label: "Construction in Progress", statement: "capex" },
      { kind: "account", code: "1430", label: "Building Improvements", statement: "tb" },
      { kind: "account", code: "1020", label: "Cash — Replacement Reserve", statement: "bs" },
      { kind: "loan", field: "reserveRequirementCents", label: "Monthly reserve requirement", statement: "debt" },
    ],
  },
  {
    id: "cfads",
    label: "CFADS",
    formula: "Period NOI − period PPE additions − monthly reserve requirement",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "D",
    description:
      "Cash flow available for debt service on a book period basis. Not a GAAP cash-flow line. CapEx is the 1420–1460 net increase; reserve is the contractual monthly requirement. On OpCo, a saved deal waterfall haircuts this to the RCP/GP share (distributions after waterfall).",
    contributors: [
      { kind: "account", code: "NOI", label: "Period NOI", statement: "os" },
      { kind: "capex", field: "periodPpeAdditions", label: "Period PPE additions", statement: "cf" },
      { kind: "loan", field: "reserveRequirementCents", label: "Monthly reserve requirement", statement: "debt" },
    ],
  },
  {
    id: "cfads_dscr",
    label: "CFADS / DSCR",
    formula: "CFADS ÷ (interest + principal)",
    unit: "multiple_bps",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "D",
    description:
      "CFADS coverage of period debt service. Distinct from NOI DSCR. Null when debt service is zero.",
    contributors: [
      { kind: "account", code: "CFADS", label: "CFADS", statement: "os" },
      { kind: "account", code: "6110", label: "Interest Expense", statement: "os" },
      { kind: "loan", field: "principalCents", label: "Principal paydown", statement: "debt" },
    ],
  },
  {
    id: "budget_variance_noi",
    label: "NOI budget variance",
    formula: "Actual period NOI − Budget NOI",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "budget",
    status: "ready",
    phase: "B",
    description: "Variance $ = actual − budget. Variance % is null when budget is zero.",
    contributors: [
      { kind: "account", code: "NOI", label: "Actual period NOI", statement: "os" },
      { kind: "budget", field: "noi", label: "Budget NOI", statement: "os" },
    ],
  },
  {
    id: "physical_occupancy",
    label: "Physical occupancy",
    formula: "Occupied units ÷ rentable units",
    unit: "bps",
    noiDefinition: null,
    source: "rent_roll",
    status: "ready",
    phase: "B",
    description:
      "Rentable excludes DOWN (offline / rehab). Not inferred from vacancy GL 4020.",
    contributors: [
      { kind: "rent_roll", field: "occupiedCount", label: "Occupied units", statement: "rent_roll" },
      { kind: "rent_roll", field: "rentableCount", label: "Rentable units (ex-DOWN)", statement: "rent_roll" },
    ],
  },
  {
    id: "loss_to_lease",
    label: "Loss-to-lease",
    formula: "Σ max(0, market − in-place) on OCCUPIED",
    unit: "usd_cents",
    noiDefinition: null,
    source: "rent_roll",
    status: "ready",
    phase: "B",
    description:
      "Monthly. In-place above market is ignored. This is not loan-to-value.",
    contributors: [
      { kind: "rent_roll", field: "marketRent", label: "Occupied market rent", statement: "rent_roll" },
      { kind: "rent_roll", field: "inPlaceRent", label: "Occupied in-place rent", statement: "rent_roll" },
    ],
  },
  {
    id: "economic_occupancy_book",
    label: "Economic occupancy (book)",
    formula: "EGI ÷ GPR",
    unit: "bps",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "B",
    description: "Documented Phase B definition. Primary economic occupancy.",
    contributors: [
      { kind: "account", code: "EGI", label: "Effective Gross Income", statement: "os" },
      { kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" },
    ],
  },
  {
    id: "economic_occupancy_rent_roll",
    label: "Economic occupancy (rent-roll analog)",
    formula: "(in-place − concessions) ÷ rent-roll GPR",
    unit: "bps",
    noiDefinition: null,
    source: "rent_roll",
    status: "ready",
    phase: "B",
    description: "Secondary analog. Primary is book EGI / GPR.",
    contributors: [
      { kind: "rent_roll", field: "egiAnalog", label: "In-place − concessions", statement: "rent_roll" },
      { kind: "rent_roll", field: "gpr", label: "Rent-roll GPR", statement: "rent_roll" },
    ],
  },
  {
    id: "breakeven_occupancy",
    label: "Breakeven occupancy",
    formula: "(OpEx + interest + principal paydown − other income) ÷ GPR",
    unit: "bps",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "B",
    description:
      "Depreciation and OpCo AM fees excluded. Principal is the decrease in 2110+2210 (draws floor at $0).",
    contributors: [
      { kind: "account", code: "OX", label: "In-NOI OpEx", statement: "os" },
      { kind: "account", code: "6110", label: "Interest Expense", statement: "os" },
      { kind: "account", code: "2110", label: "Mortgage Payable — Current", statement: "tb" },
      { kind: "account", code: "2210", label: "Mortgage Payable — Long Term", statement: "tb" },
      { kind: "account", code: "4100", label: "Other Income", statement: "os" },
      { kind: "account", code: "4010", label: "Gross Potential Rent", statement: "os" },
    ],
  },
  {
    id: "dscr",
    label: "DSCR",
    formula: "Period NOI ÷ (interest + principal)",
    unit: "multiple_bps",
    noiDefinition: "period",
    source: "loan",
    status: "ready",
    phase: "C",
    description: "Threshold stored in bps on the loan file (12500 = 1.25x). Value-add may fail monthly DSCR.",
    contributors: [
      { kind: "account", code: "NOI", label: "Period NOI", statement: "os" },
      { kind: "account", code: "6110", label: "Interest Expense", statement: "debt" },
      { kind: "loan", field: "principalCents", label: "Principal", statement: "debt" },
    ],
  },
  {
    id: "debt_yield",
    label: "Debt yield",
    formula: "(Period NOI × 12) ÷ UPB",
    unit: "bps",
    noiDefinition: "annualized_period",
    source: "loan",
    status: "ready",
    phase: "C",
    description: "Numerator is annualized period NOI, not T12. Threshold stored in bps (800 = 8.00%).",
    contributors: [
      { kind: "account", code: "NOI", label: "Period NOI × 12", statement: "os" },
      { kind: "loan", field: "currentUpbCents", label: "Current UPB", statement: "debt" },
    ],
  },
  {
    id: "upb",
    label: "Unpaid principal balance",
    formula: "Loan-file current UPB (= GL 2110 + 2210)",
    unit: "usd_cents",
    noiDefinition: null,
    source: "loan",
    status: "ready",
    phase: "C",
    description: "Book UPB. Must equal mortgage GL.",
    contributors: [
      { kind: "loan", field: "currentUpbCents", label: "Loan-file UPB", statement: "debt" },
      { kind: "account", code: "2110", label: "Mortgage Payable — Current", statement: "tb" },
      { kind: "account", code: "2210", label: "Mortgage Payable — Long Term", statement: "tb" },
    ],
  },
  {
    id: "maturity",
    label: "Maturity",
    formula: "Loan maturity date; remaining months from period-end",
    unit: "date",
    noiDefinition: null,
    source: "loan",
    status: "ready",
    phase: "C",
    description: "Contractual maturity from the debt file.",
    contributors: [{ kind: "loan", field: "maturityDate", label: "Maturity date", statement: "debt" }],
  },
  {
    id: "ltv",
    label: "Loan-to-value / loan-to-cost",
    formula: "UPB ÷ appraised value (or cost — policy)",
    unit: "gated",
    noiDefinition: null,
    source: "none",
    status: "gated",
    phase: "D",
    description:
      "Loan file has UPB. Appraisal is not in the books. Do not divide UPB by book cost / PPE and label it LTV.",
    contributors: [{ kind: "loan", field: "currentUpbCents", label: "UPB (value missing)", statement: "debt" }],
  },
  {
    id: "delinquency",
    label: "Delinquency / AR aging",
    formula: "Tenant charges and receipts aging (not in books)",
    unit: "gated",
    noiDefinition: null,
    source: "none",
    status: "gated",
    phase: "B+",
    description: "Account 1110 is a control total only. Do not invent a delinquency rate from AR / GPR.",
    contributors: [{ kind: "account", code: "1110", label: "AR control total (not aging)", statement: "tb" }],
  },
  {
    id: "fee_income",
    label: "Fee income",
    formula: "GL 7010 period credit-net",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "A",
    description: "OpCo asset-management fee income. Eliminated on the combined roll-up.",
    contributors: [{ kind: "account", code: "7010", label: "Asset Management Fee Income", statement: "os" }],
  },
  {
    id: "ga_ratio",
    label: "G&A %",
    formula: "(5110 + 5610 + 5990) ÷ 7010",
    unit: "bps",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "D",
    description:
      "OpCo G&A tagged as payroll + administrative + other, over AM fee income. Insurance 5710 excluded from this tag.",
    contributors: [
      { kind: "account", code: "5110", label: "Payroll", statement: "os" },
      { kind: "account", code: "5610", label: "Administrative", statement: "os" },
      { kind: "account", code: "5990", label: "Other Operating Expenses", statement: "os" },
      { kind: "account", code: "7010", label: "Asset Management Fee Income", statement: "os" },
    ],
  },
  {
    id: "liquidity_months",
    label: "Liquidity (months of OpEx)",
    formula: "Ending cash ÷ period OpEx",
    unit: "months_hundredths",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "D",
    description:
      "Liquidity proxy, not a bank-rec forecast. Combined view uses stacked cash and look-through SPE OpEx. When a waterfall is saved, the numerator is RCP/GP cash after waterfall.",
    contributors: [
      { kind: "account", code: "1010", label: "Cash accounts", statement: "bs" },
      { kind: "account", code: "OX", label: "Period OpEx", statement: "os" },
    ],
  },
  {
    id: "look_through_upb",
    label: "Look-through UPB",
    formula: "Σ SPE loan-file UPB",
    unit: "usd_cents",
    noiDefinition: null,
    source: "loan",
    status: "ready",
    phase: "D",
    description:
      "Stacked first-mortgage UPB of wholly owned SPEs. This is combined leverage inventory — not LTV and not GAAP consolidation.",
    contributors: [{ kind: "loan", field: "currentUpbCents", label: "Each SPE UPB", statement: "debt" }],
  },
  {
    id: "properties_units",
    label: "Properties / units",
    formula: "Count of SPE entities and Σ unitCount",
    unit: "count",
    noiDefinition: null,
    source: "mixed",
    status: "ready",
    phase: "D",
    description: "Portfolio scale. Units include DOWN.",
    contributors: [{ kind: "entity", field: "unitCount", label: "SPE unit counts" }],
  },
  {
    id: "noi_concentration",
    label: "NOI concentration",
    formula: "SPE period NOI ÷ Σ SPE period NOI",
    unit: "bps",
    noiDefinition: "period",
    source: "gl",
    status: "ready",
    phase: "D",
    description: "Look-through property NOI mix. Combined roll-up is not a GAAP consolidation.",
    contributors: [{ kind: "entity", field: "noi", label: "Each SPE period NOI", statement: "os" }],
  },
  {
    id: "rcp_after_waterfall",
    label: "RCP cash after waterfall",
    formula: "Σ SPE GP/RCP share of cash-if-distributed + OpCo cash",
    unit: "usd_cents",
    noiDefinition: null,
    source: "mixed",
    status: "ready",
    phase: "F+",
    description:
      "OpCo entitlement after each live SPE’s LP/GP waterfall and optional Co-GP split. Default with no template is 100% look-through. Not a GAAP minority-interest line.",
    contributors: [{ kind: "account", code: "1010", label: "RCP cash after waterfall", statement: "bs" }],
  },
  {
    id: "co_gp_after_waterfall",
    label: "Co-GP after waterfall",
    formula: "Σ SPE Co-GP share of CFADS (GP-side promote/co-invest × Co-GP bps)",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "F+",
    description:
      "Third-party Co-GP at the deal/SPE. Not upstreamed to RCP OpCo. $0 when Co-GP share is 0 (two-party LP vs single GP/RCP).",
    contributors: [{ kind: "entity", field: "coGpShare", label: "Co-GP CFADS after waterfall" }],
  },
  {
    id: "lp_pref_unpaid",
    label: "LP pref unpaid",
    formula: "Unpaid preferred return after this period’s CFADS waterfall (including this run’s accrual)",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "F+",
    description:
      "Preferred return still owed to LP-class after the period distribution waterfall. $0 when no template is saved or capital is not entered.",
    contributors: [{ kind: "entity", field: "unpaidPref", label: "LP pref unpaid after waterfall" }],
  },
  {
    id: "lp_share_not_upstreamed",
    label: "LP share (not upstreamed)",
    formula: "Σ SPE LP share of CFADS after waterfall",
    unit: "usd_cents",
    noiDefinition: "period",
    source: "mixed",
    status: "ready",
    phase: "F+",
    description:
      "Distributable cash that stays with LPs under the deal waterfall and does not roll to RCP OpCo. $0 under 100% look-through.",
    contributors: [{ kind: "entity", field: "lpShare", label: "LP CFADS share" }],
  },
];

export const RATIO_DICTIONARY_BY_ID = new Map(RATIO_DICTIONARY.map((r) => [r.id, r]));

export function getRatioDefinition(id: string): RatioDefinition | undefined {
  return RATIO_DICTIONARY_BY_ID.get(id as RatioId);
}

export function isRatioId(value: string): value is RatioId {
  return (RATIO_IDS as readonly string[]).includes(value);
}

export function statementHref(
  statement: NonNullable<RatioDefinition["contributors"][number]["statement"]>,
  entityCode: string,
  period: string,
  view?: string,
): string {
  const params = new URLSearchParams({ entity: entityCode, period });
  if (view) params.set("view", view);
  const q = params.toString();
  switch (statement) {
    case "tb":
      return `/reports/trial-balance?${q}`;
    case "os":
      return `/reports/operating-statement?${q}`;
    case "is":
      return `/reports/income-statement?${q}`;
    case "bs":
      return `/reports/balance-sheet?${q}`;
    case "cf":
      return `/reports/cash-flow?${q}`;
    case "debt":
      return `/debt?${q}`;
    case "rent_roll":
      return `/properties/${entityCode}?${q}`;
    case "capex":
      return `/capex?${q}`;
    default:
      return `/dashboard?${q}`;
  }
}
