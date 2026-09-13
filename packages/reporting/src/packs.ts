import { buildChartSuite, CHART_IDS, CHART_TITLES, type ChartId, type ChartSuite } from "./charts";
import { buildAllNarratives, buildNarrative, type AudienceNarrative } from "./narratives";
import type { AudienceId, PeriodSnapshot } from "./snapshot-types";
import { AUDIENCE_LABELS } from "./snapshot-types";
import { formatUsd, periodLabel } from "./formatters";

export const PACK_IDS = ["monthly_investor", "quarterly_lender", "ic_memo", "management_flash"] as const;
export type PackId = (typeof PACK_IDS)[number];

export type PackMeta = {
  id: PackId;
  title: string;
  audience: AudienceId;
  cadence: "monthly" | "quarterly" | "as_needed" | "flash";
  description: string;
  charts: ChartId[];
};

export const PACK_CATALOG: PackMeta[] = [
  {
    id: "monthly_investor",
    title: "Monthly Investor Pack",
    audience: "lp",
    cadence: "monthly",
    description: "LP performance, distributions proxy (CFADS), risk, and operating health with the GPR→NOI→BTCF waterfall.",
    charts: [
      "waterfall_gpr_noi_btcf",
      "trends_noi_occupancy_opex_dscr",
      "portfolio_concentration",
      "actual_vs_budget_bridge",
      "bs_composition",
    ],
  },
  {
    id: "quarterly_lender",
    title: "Quarterly Lender Pack",
    audience: "lender",
    cadence: "quarterly",
    description: "Collateral, DSCR / debt yield, reserves, maturity wall, and covenant compliance. LTV stays gated.",
    charts: ["debt_maturity_wall", "capex_vs_reserves", "trends_noi_occupancy_opex_dscr", "bs_composition", "portfolio_heatmap"],
  },
  {
    id: "ic_memo",
    title: "IC Memo Pack",
    audience: "ic",
    cadence: "as_needed",
    description: "Thesis tracking, budget bridge, concentration, covenants, and a go / hold / fix recommendation.",
    charts: [
      "waterfall_gpr_noi_btcf",
      "actual_vs_budget_bridge",
      "portfolio_concentration",
      "portfolio_heatmap",
      "debt_maturity_wall",
    ],
  },
  {
    id: "management_flash",
    title: "Management Flash",
    audience: "mgmt",
    cadence: "flash",
    description: "Operating actions, OpEx composition, variance owners, and CapEx / reserve priorities.",
    charts: ["opex_composition", "actual_vs_budget_bridge", "capex_vs_reserves", "trends_noi_occupancy_opex_dscr"],
  },
];

export type PackKpi = { label: string; value: string; hint: string };

export type PackSlide =
  | { kind: "cover"; title: string; subtitle: string; bullets: string[] }
  | { kind: "kpis"; title: string; kpis: PackKpi[] }
  | { kind: "chart"; title: string; chartId: ChartId }
  | { kind: "narrative"; title: string; narrative: AudienceNarrative }
  | { kind: "disclosures"; title: string; bullets: string[] };

export type BuiltPack = {
  meta: PackMeta;
  entityCode: string;
  entityName: string;
  period: string;
  viewLabel: string;
  generatedLabel: string;
  narrative: AudienceNarrative;
  charts: ChartSuite;
  slides: PackSlide[];
  filenameBase: string;
};

export function getPackMeta(id: string): PackMeta | undefined {
  return PACK_CATALOG.find((p) => p.id === id);
}

export function isPackId(value: string): value is PackId {
  return (PACK_IDS as readonly string[]).includes(value);
}

function kpi(label: string, value: string, hint: string): PackKpi {
  return { label, value, hint };
}

function commonDisclosures(snap: PeriodSnapshot): string[] {
  return [
    `Book basis · USD · en-US · America/New_York · integer cents. Period ${snap.period}.`,
    snap.t12Complete
      ? `T12 NOI ${formatUsd(snap.t12NoiCents)}.`
      : `T12 is incomplete (${snap.t12MonthsAvailable}/12 months, ${formatUsd(snap.t12NoiCents)}) and is not annualized.`,
    "AM fees sit below NOI.",
    snap.rollupIsNotGaap
      ? "OpCo multi-SPE view is a combined roll-up (IC 1310/2310 and AM 6310/7010 eliminated) — not a GAAP consolidation."
      : "Standalone SPE presentation.",
    `LTV gated: ${snap.ltvReason}`,
    `Delinquency not available: ${snap.delinquencyReason}`,
    "CFADS is a distributions proxy, not a posted investor distribution. No promote waterfall.",
    "No live PMS or bank feed. Charts reprint the same period snapshot as the narratives.",
  ];
}

function coverBullets(snap: PeriodSnapshot, audience: AudienceId): string[] {
  return [
    `${snap.entityName} · ${snap.entityCode}`,
    periodLabel(snap.period),
    snap.viewLabel,
    `Audience: ${AUDIENCE_LABELS[audience]}`,
    `Period NOI ${formatUsd(snap.noiCents)}`,
  ];
}

export function buildPack(snap: PeriodSnapshot, packId: PackId): BuiltPack {
  const meta = getPackMeta(packId);
  if (!meta) throw new Error(`Unknown pack ${packId}`);
  const charts = buildChartSuite(snap);
  const narrative = buildNarrative(snap, meta.audience);
  const kpis: PackKpi[] = [
    kpi("Period NOI", formatUsd(snap.noiCents), "AM fees below this line"),
    kpi("BTCF", formatUsd(snap.btcfCents), "NOI − interest − principal"),
    kpi("CFADS", formatUsd(snap.cfadsCents), "Distributions proxy"),
    kpi("DSCR", narrative.citations.find((c) => c.id === "dscr")?.value ?? "—", "Period NOI / DS"),
    kpi("Physical occ.", narrative.citations.find((c) => c.id === "occ_phys")?.value ?? "—", "Rent roll"),
    kpi("OpEx ratio", narrative.citations.find((c) => c.id === "opex_ratio")?.value ?? "—", "OpEx ÷ EGI"),
  ];
  const slides: PackSlide[] = [
    {
      kind: "cover",
      title: meta.title,
      subtitle: `${snap.entityName} · ${periodLabel(snap.period)}`,
      bullets: coverBullets(snap, meta.audience),
    },
    { kind: "kpis", title: "Period snapshot", kpis },
    ...meta.charts.map((chartId) => ({ kind: "chart" as const, title: CHART_TITLES[chartId], chartId })),
    { kind: "narrative", title: `${AUDIENCE_LABELS[meta.audience]} narrative`, narrative },
    { kind: "disclosures", title: "Disclosures", bullets: commonDisclosures(snap) },
  ];
  return {
    meta,
    entityCode: snap.entityCode,
    entityName: snap.entityName,
    period: snap.period,
    viewLabel: snap.viewLabel,
    generatedLabel: `Roche Capital Partners · Portfolio Control · ${meta.title}`,
    narrative,
    charts,
    slides,
    filenameBase: `RCP-${meta.id}-${snap.entityCode}-${snap.period}`,
  };
}

export function buildAllPacks(snap: PeriodSnapshot): BuiltPack[] {
  return PACK_CATALOG.map((meta) => buildPack(snap, meta.id));
}

export { CHART_IDS, CHART_TITLES, buildAllNarratives, buildChartSuite };
