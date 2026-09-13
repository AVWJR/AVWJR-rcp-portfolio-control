import type { ChartId } from "./charts";
import type { AudienceId } from "./snapshot-types";
import { AUDIENCE_LABELS, AUDIENCES } from "./snapshot-types";

export type AudienceKpiId =
  | "noi"
  | "noi_per_unit"
  | "opex_ratio"
  | "occupancy"
  | "occ_book"
  | "breakeven"
  | "be_cushion"
  | "budget_variance"
  | "cash"
  | "btcf"
  | "cfads"
  | "cfads_dscr"
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
  | "ga_ratio"
  | "look_through_noi"
  | "concentration"
  | "controllable_opex"
  | "ltl"
  | "capex"
  | "recommendation"
  | "t12_status"
  | "annualized_noi"
  | "lease_rollover"
  | "close_status"
  | "mom"
  | "units"
  | "properties";

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
  lp: {
    audience: "lp",
    label: AUDIENCE_LABELS.lp,
    title: "Limited Partner update",
    dek: "Stewardship: period NOI and NOI/unit versus plan, capital at risk (concentration, covenant stress, liquidity), and the ask / next capital event.",
    tone: "Capital-partner stewardship. One to two pages. Cites units. Covenant fails appear only as a watchlist strip — not the lead story.",
    sectionHeadings: ["NOI / NOI-unit versus plan", "Capital at risk", "Ask / next capital event"],
    kpiIds: [
      "look_through_noi",
      "noi_per_unit",
      "opex_ratio",
      "budget_variance",
      "occupancy",
      "occ_book",
      "ltl",
      "be_cushion",
      "concentration",
      "liquidity",
      "upb",
    ],
    chartIds: ["portfolio_concentration", "occupancy_breakeven", "t12_status", "covenant_watchlist"],
    exclude: [
      "full chart of accounts dump",
      "K-1 / tax bridge detail",
      "OpCo G&A% deep dive",
      "gated LTV or delinquency shown as live",
    ],
  },
  gp: {
    audience: "gp",
    label: AUDIENCE_LABELS.gp,
    title: "General Partner operating view",
    dek: "What to intervene on this month: fee income and OpCo burn versus property, and the problem-child SPE.",
    tone: "Sponsor operating view. Actionable. Blunt is fine. Lender-legal jargon is not the spine.",
    sectionHeadings: ["Intervene this month", "Fee income / OpCo burn versus property", "Problem-child SPE"],
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
      "ga_ratio",
      "liquidity",
      "lease_rollover",
    ],
    chartIds: ["portfolio_heatmap", "capex_vs_reserves", "covenant_watchlist"],
    exclude: ["lender-legal jargon as the primary frame", "tax M-1", "fake delinquency"],
  },
  ic: {
    audience: "ic",
    label: AUDIENCE_LABELS.ic,
    title: "Investment Committee memo",
    dek: "Underwrite-to-decision: go / hold / kill on thesis, clean period vs T12 vs annualized labels, and explicit falsifiers.",
    tone: "Decision memo. Skeptical. Recommendation first. No silent T12 annualization. LTV stays gated without appraisal.",
    sectionHeadings: ["Go / hold / kill", "Period versus T12 versus annualized", "Falsifiers"],
    kpiIds: [
      "recommendation",
      "noi",
      "t12_status",
      "annualized_noi",
      "dscr",
      "debt_yield",
      "maturity",
      "occupancy",
      "occ_book",
      "be_cushion",
      "ltl",
      "concentration",
    ],
    chartIds: ["decision_posture", "upb_stack", "t12_status"],
    exclude: ["marketing fluff", "unlabeled annualized-as-T12", "LTV without appraisal"],
  },
  lender: {
    audience: "lender",
    label: AUDIENCE_LABELS.lender,
    title: "Lender credit memo",
    dek: "Covenant-first: in covenant, cure path, DSCR / debt yield / reserves / maturity, and collateral ops (occupancy, breakeven, cash).",
    tone: "Covenant-first credit memo. Numeric. No spin. No LP narrative. OpCo fee is not property cash.",
    sectionHeadings: ["In covenant?", "Cure path", "Collateral operations"],
    kpiIds: [
      "dscr",
      "debt_yield",
      "upb",
      "maturity",
      "reserves",
      "capex",
      "occupancy",
      "breakeven",
      "occ_book",
      "cash",
      "cfads",
      "cfads_dscr",
      "covenant_watch",
    ],
    chartIds: ["coverage_vs_threshold", "trends_noi_occupancy_opex_dscr", "debt_maturity_wall", "capex_vs_reserves"],
    exclude: ["OpCo fee as property cash", "LP stewardship narrative", "tax / K-1", "invented LTV"],
  },
  mgmt: {
    audience: "mgmt",
    label: AUDIENCE_LABELS.mgmt,
    title: "Management Committee close",
    dek: "Controller-plus-ops checklist: books close clean, combined coherent, variance / IC / close locks, and what ships externally.",
    tone: "Controller + ops checklist. Combined roll-up is not a GAAP consolidation. No tax-filing language. No marketing copy.",
    sectionHeadings: ["Books close clean?", "Combined coherent?", "What ships externally?"],
    kpiIds: [
      "close_status",
      "am_fees",
      "budget_variance",
      "mom",
      "look_through_noi",
      "concentration",
      "covenant_watch",
      "occupancy",
      "units",
      "properties",
    ],
    chartIds: ["close_control", "actual_vs_budget_bridge", "portfolio_heatmap"],
    exclude: ["marketing copy", "claiming GAAP consolidation", "tax filing language"],
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

/** KPI ids that appear on three or more audience briefs — the only shared strip. */
export function sharedAudienceKpiIds(): AudienceKpiId[] {
  const counts = new Map<AudienceKpiId, number>();
  for (const audience of AUDIENCES) {
    for (const id of AUDIENCE_BRIEFS[audience].kpiIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([id]) => id);
}

export function partitionAudienceKpis(audience: AudienceId): {
  shared: AudienceKpiId[];
  specific: AudienceKpiId[];
} {
  const shared = new Set(sharedAudienceKpiIds());
  const sharedIds: AudienceKpiId[] = [];
  const specific: AudienceKpiId[] = [];
  for (const id of AUDIENCE_BRIEFS[audience].kpiIds) {
    if (shared.has(id)) sharedIds.push(id);
    else specific.push(id);
  }
  return { shared: sharedIds, specific };
}
