/**
 * Live RCP ratio types. Amounts are integer USD cents. Ratios are integer
 * basis points (10_000 = 100.00% or 1.00x depending on unit).
 */

export const NOI_DEFINITIONS = ["period", "t12", "annualized_period"] as const;
export type NoiDefinition = (typeof NOI_DEFINITIONS)[number];

export const RATIO_UNITS = [
  "usd_cents",
  "bps",
  "multiple_bps",
  "count",
  "months_hundredths",
  "date",
  "gated",
] as const;
export type RatioUnit = (typeof RATIO_UNITS)[number];

export const RATIO_SOURCES = ["gl", "rent_roll", "loan", "capex", "budget", "mixed", "none"] as const;
export type RatioSource = (typeof RATIO_SOURCES)[number];

export const RATIO_STATUSES = ["ready", "incomplete", "gated"] as const;
export type RatioStatus = (typeof RATIO_STATUSES)[number];

export const RATIO_IDS = [
  "noi_period",
  "noi_t12",
  "noi_annualized",
  "noi_per_unit",
  "egi",
  "gpr",
  "opex_ratio",
  "controllable_opex",
  "controllable_opex_ratio",
  "cash",
  "capex_vs_reserves",
  "cfads",
  "cfads_dscr",
  "budget_variance_noi",
  "physical_occupancy",
  "loss_to_lease",
  "economic_occupancy_book",
  "economic_occupancy_rent_roll",
  "breakeven_occupancy",
  "dscr",
  "debt_yield",
  "upb",
  "maturity",
  "ltv",
  "delinquency",
  "fee_income",
  "ga_ratio",
  "liquidity_months",
  "look_through_upb",
  "properties_units",
  "noi_concentration",
] as const;

export type RatioId = (typeof RATIO_IDS)[number];

export type ContributorKind = "account" | "rent_roll" | "loan" | "capex" | "budget" | "entity";

export type RatioContributorSpec = {
  kind: ContributorKind;
  code?: string;
  field?: string;
  label: string;
  statement?: "tb" | "os" | "is" | "bs" | "cf" | "debt" | "rent_roll" | "capex";
};

export type LiveContributor = {
  kind: ContributorKind;
  code?: string;
  field?: string;
  label: string;
  amountCents?: bigint;
  text?: string;
  href: string;
};

export type RatioDefinition = {
  id: RatioId;
  label: string;
  formula: string;
  unit: RatioUnit;
  noiDefinition: NoiDefinition | null;
  source: RatioSource;
  status: RatioStatus;
  phase: string;
  description: string;
  contributors: RatioContributorSpec[];
};

export type TrailingNoi = {
  definition: "t12" | "incomplete";
  monthsAvailable: number;
  requiredMonths: 12;
  noiCents: bigint;
};

export type CashBreakdown = {
  operating: bigint;
  reserve: bigint;
  escrow: bigint;
  deposits: bigint;
  total: bigint;
};

export type CapexReserveCompare = {
  periodCapexCents: bigint;
  reserveCashCents: bigint;
  reserveRequirementCents: bigint;
};

export type ConcentrationRow = {
  entityCode: string;
  entityName: string;
  noiCents: bigint;
  shareBps: number | null;
  unitCount: number;
};
