import type { ChartId } from "./charts";
import type { AudienceId } from "./snapshot-types";
import { AUDIENCE_LABELS } from "./snapshot-types";

export type AudienceKpiId =
  | "noi"
  | "noi_per_unit"
  | "opex_ratio"
  | "occupancy"
  | "occ_book"
  | "breakeven"
  | "budget_variance"
  | "cash"
  | "btcf"
  | "cfads"
  | "dscr"
  | "debt_yield"
  | "upb"
  | "debt_service"
  | "reserves"
  | "maturity"
  | "covenant_watch"
  | "liquidity"
  | "fee_income"
  | "am_fees"
  | "look_through_noi"
  | "concentration"
  | "controllable_opex"
  | "ltl"
  | "capex"
  | "recommendation";

export type AudienceBrief = {
  audience: AudienceId;
  label: string;
  title: string;
  dek: string;
  tone: string;
  sectionHeadings: string[];
  kpiIds: AudienceKpiId[];
  chartIds: ChartId[];
  exclude: string[];
};

export const AUDIENCE_BRIEFS: Record<AudienceId, AudienceBrief> = {
  lender: {
    audience: "lender",
    label: AUDIENCE_LABELS.lender,
    title: "Lender credit memo",
    dek: "Covenant coverage, debt service, reserves, maturity, and occupancy versus breakeven — not an LP update.",
    tone: "Covenant / credit memo. Numeric. Conservative. No investor-return theater.",
    sectionHeadings: [
      "DSCR and debt yield versus threshold",
      "Debt service, UPB, and maturity",
      "NOI available for debt service",
      "Occupancy, breakeven, and covenant watch",
      "Reserves and CapEx as collateral",
    ],
    kpiIds: ["dscr", "debt_yield", "upb", "debt_service", "reserves", "maturity", "noi", "occupancy", "breakeven", "covenant_watch"],
    chartIds: ["coverage_vs_threshold", "trends_noi_occupancy_opex_dscr", "debt_maturity_wall", "capex_vs_reserves"],
    exclude: ["LP IRR", "promote waterfall", "IC go/hold theater", "G&A politics"],
  },
  lp: {
    audience: "lp",
    label: AUDIENCE_LABELS.lp,
    title: "Limited Partner update",
    dek: "Stewardship update: period NOI and NOI/unit versus plan, occupancy (physical and book), concentration, liquidity, and CFADS as a distributions proxy.",
    tone: "Capital-partner stewardship. One to two pages. Cites units. Covenants appear only as a fail strip — not the lead story.",
    sectionHeadings: [
      "Period NOI and NOI per unit",
      "Occupancy, book economic occupancy, and loss-to-lease",
      "Capital at risk",
      "Cash, BTCF, and distributions proxy",
    ],
    kpiIds: [
      "look_through_noi",
      "noi_per_unit",
      "opex_ratio",
      "budget_variance",
      "occupancy",
      "occ_book",
      "ltl",
      "breakeven",
      "concentration",
      "liquidity",
      "upb",
    ],
    chartIds: ["portfolio_concentration", "occupancy_breakeven", "actual_vs_budget_bridge", "coverage_vs_threshold"],
    exclude: ["loan covenant minutiae as the lead", "raw trial-balance dumps", "invented LTV"],
  },
  gp: {
    audience: "gp",
    label: AUDIENCE_LABELS.gp,
    title: "General Partner operating view",
    dek: "What to intervene on this month: per-SPE NOI, fee income versus property, CapEx versus reserves, and the problem-child file.",
    tone: "Sponsor operating view. Actionable. Blunt is fine. Fee income is below NOI on the SPE.",
    sectionHeadings: [
      "Fee income below NOI",
      "Look-through NOI and SPE contribution",
      "Liquidity runway",
      "Execution versus plan",
    ],
    kpiIds: [
      "noi",
      "occupancy",
      "ltl",
      "opex_ratio",
      "controllable_opex",
      "capex",
      "cfads",
      "budget_variance",
      "fee_income",
      "liquidity",
    ],
    chartIds: ["portfolio_heatmap", "capex_vs_reserves", "portfolio_concentration", "fee_vs_noi"],
    exclude: ["LP waterfall fluff", "lender covenant memo as the spine"],
  },
  ic: {
    audience: "ic",
    label: AUDIENCE_LABELS.ic,
    title: "Investment Committee memo",
    dek: "Underwrite-to-decision: go / hold / fix, period versus T12 versus annualized labels, concentration, and what would change the call.",
    tone: "Decision memo. Skeptical. Recommendation first. No silent T12 annualization. LTV stays gated.",
    sectionHeadings: [
      "Go / hold / fix",
      "Thesis versus actuals",
      "Key risks",
      "CapEx and CIP status",
      "What would change the call",
    ],
    kpiIds: ["recommendation", "noi", "budget_variance", "dscr", "debt_yield", "occupancy", "concentration", "capex", "maturity"],
    chartIds: [
      "coverage_vs_threshold",
      "debt_maturity_wall",
      "actual_vs_budget_bridge",
      "portfolio_concentration",
      "portfolio_heatmap",
    ],
    exclude: ["LP distribution theater", "site-level weekly punch list as the memo"],
  },
  mgmt: {
    audience: "mgmt",
    label: AUDIENCE_LABELS.mgmt,
    title: "Management flash",
    dek: "Controller-plus-ops flash: close hygiene, AM below NOI, variance, occupancy / LTL, and what ships externally.",
    tone: "Controller + ops checklist. Combined roll-up is not a GAAP consolidation. No tax-filing language.",
    sectionHeadings: [
      "What to do this week",
      "Occupancy and loss-to-lease",
      "Controllable OpEx and variance drivers",
      "CapEx versus R&M",
      "Period-close follow-through",
    ],
    kpiIds: ["occupancy", "ltl", "breakeven", "controllable_opex", "budget_variance", "look_through_noi", "concentration", "am_fees"],
    chartIds: ["actual_vs_budget_bridge", "portfolio_heatmap", "opex_composition", "capex_vs_reserves"],
    exclude: ["IC go/hold theater", "LP IRR / waterfall fluff", "raw TB dumps"],
  },
};

export function getAudienceBrief(audience: AudienceId): AudienceBrief {
  return AUDIENCE_BRIEFS[audience];
}

export function audienceChartIds(audience: AudienceId): ChartId[] {
  return AUDIENCE_BRIEFS[audience].chartIds;
}

export function audienceKpiIds(audience: AudienceId): AudienceKpiId[] {
  return AUDIENCE_BRIEFS[audience].kpiIds;
}
