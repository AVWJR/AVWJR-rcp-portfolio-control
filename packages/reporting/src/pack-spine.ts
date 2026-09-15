import { AUDIENCE_BRIEFS, type AudienceKpiId } from "./audience-briefs";
import type { ChartId, ChartSuite } from "./charts";
import { CHART_TITLES } from "./charts";
import {
  formatBpsAsMultiple,
  formatBpsAsPercent,
  formatBpsAsYield,
  formatMonthsCoverage,
  formatUsd,
  formatUsdOrDash,
  periodLabel,
} from "./formatters";
import { icRecommendation } from "./ic-recommendation";
import type { AudienceNarrative, NarrativeCitation } from "./narratives";
import type { AudienceId, PeriodSnapshot } from "./snapshot-types";
import { AUDIENCE_LABELS } from "./snapshot-types";
import { audienceCfads, gpDistributionSentence, waterfallSplitSentence } from "./waterfall-view";

export const PACK_SPINE = ["cover", "kpis", "thesis", "visuals", "risks", "appendix"] as const;
export type PackSpineKind = (typeof PACK_SPINE)[number];

/** Cap the live deck; heatmap / CoA-style tables sit in appendix. */
export const LIVE_DECK_MAX_SLIDES = 8;
export const LIVE_KPI_MIN = 3;
export const LIVE_KPI_MAX = 5;
export const LIVE_VISUAL_MIN = 2;
export const LIVE_VISUAL_MAX = 4;

export type PackKpi = { label: string; value: string; hint: string; soWhat?: string };

export type PackVisual = {
  chartId: ChartId;
  title: string;
  soWhat: string;
  mode: "chart" | "infographic" | "table";
};

export type PackRiskItem = { heading: string; body: string; proof: string };

export type PackAppendixTable = {
  title: string;
  soWhat: string;
  headers: string[];
  rows: string[][];
};

export type PackSlide =
  | {
      kind: "cover";
      title: string;
      subtitle: string;
      audienceLabel: string;
      thesis: string;
      proofLabel: string;
      proofValue: string;
      bullets: string[];
    }
  | { kind: "kpis"; title: string; kpis: PackKpi[] }
  | {
      kind: "thesis";
      title: string;
      insight: string;
      proof: string;
      bullets: string[];
    }
  | { kind: "visuals"; title: string; visuals: PackVisual[] }
  | { kind: "risks"; title: string; items: PackRiskItem[]; ask: string }
  | {
      kind: "appendix";
      title: string;
      bullets: string[];
      extraKpis: PackKpi[];
      tables: PackAppendixTable[];
      callouts: { title: string; body: string; soWhat: string }[];
    };

/** 3–5 board KPIs — audience skin, same strip geometry. */
export const EXEC_KPI_IDS: Record<AudienceId, AudienceKpiId[]> = {
  lp: ["look_through_noi", "noi_per_unit", "lp_share", "lp_pref_unpaid", "occupancy"],
  gp: ["noi", "occupancy", "cfads", "gp_promote", "capex"],
  ic: ["recommendation", "noi", "dscr", "lp_share", "gp_promote"],
  lender: ["dscr", "debt_yield", "occupancy", "reserves", "upb"],
  mgmt: ["close_status", "look_through_noi", "lp_share", "gp_promote", "covenant_watch"],
};

export function visualKind(id: ChartId): PackVisual["mode"] {
  if (id === "t12_status" || id === "decision_posture" || id === "close_control") return "infographic";
  if (id === "covenant_watchlist" || id === "portfolio_heatmap") return "table";
  return "chart";
}

function pp(bps: number): string {
  return `${(Math.abs(bps) / 100).toFixed(1)} pp`;
}

export function chartSoWhat(id: ChartId, snap: PeriodSnapshot, suite: ChartSuite): string {
  switch (id) {
    case "waterfall_gpr_noi_btcf":
      return `BTCF is ${formatUsd(snap.btcfCents)} after debt service — AM fees sit below NOI and are not in this stack.`;
    case "trends_noi_occupancy_opex_dscr":
      return suite.trends.occupancyNote;
    case "opex_composition":
      return `In-NOI OpEx is ${formatUsd(snap.opexCents)} (${formatBpsAsPercent(snap.opexRatioBps)} of EGI).`;
    case "capex_vs_reserves":
      return suite.capexVsReserves.footnote;
    case "debt_maturity_wall":
      return snap.monthsRemaining === null
        ? "No first-mortgage maturity is posted."
        : `First-mortgage maturity is ${snap.maturityDate ?? "—"} (${snap.monthsRemaining} months remaining).`;
    case "portfolio_concentration": {
      const slices = suite.concentration.slices;
      if (slices.length <= 1) {
        return `${snap.entityCode} is a single-asset file — 100% of this NOI, not a diversification claim.`;
      }
      const top = slices[0]!;
      const share = top.shareBps == null ? "" : `${(top.shareBps / 100).toFixed(1)}%`;
      return `${top.label} is ${share} of look-through period NOI. Combined roll-up is not a GAAP consolidation.`;
    }
    case "actual_vs_budget_bridge":
      return suite.budgetBridge.footnote;
    case "bs_composition":
      return suite.bsComposition.footnote;
    case "portfolio_heatmap":
      return "SPE scorecard reprints period NOI, occupancy, OpEx, and DSCR — LTV stays gated.";
    case "coverage_vs_threshold": {
      const dscr = suite.coverageVsThreshold.rows.find((r) => r.key === "dscr");
      if (!dscr) return suite.coverageVsThreshold.footnote;
      return `DSCR is ${dscr.actual.toFixed(2)}x versus ${dscr.threshold.toFixed(2)}x — ${dscr.pass === false ? "fail" : dscr.pass ? "pass" : "not computed"}.`;
    }
    case "occupancy_breakeven": {
      if (snap.physicalOccupancyBps === null || snap.breakevenOccupancyBps === null) {
        return suite.occupancyBreakeven.footnote;
      }
      const gap = snap.physicalOccupancyBps - snap.breakevenOccupancyBps;
      return `Physical occupancy is ${pp(gap)} ${gap >= 0 ? "above" : "below"} breakeven.`;
    }
    case "liquidity_runway":
      return `Cash covers ${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of period OpEx.`;
    case "fee_vs_noi":
      return suite.feeVsNoi.footnote;
    case "covenant_watchlist": {
      const fails = suite.covenantWatchlist.rows.filter((r) => r.tone === "fail");
      return fails.length
        ? `Watchlist (fails only): ${fails.map((r) => `${r.label} ${r.reason}`).join("; ")}.`
        : "No covenant fails on the watchlist this period.";
    }
    case "t12_status":
      return snap.t12Complete
        ? `T12 NOI is ${formatUsd(snap.t12NoiCents)} (12/12). Do not relabel period NOI as T12.`
        : `T12 is ${snap.t12MonthsAvailable}/12 months and is not annualized.`;
    case "decision_posture":
      return `${suite.decisionPosture.action}: ${suite.decisionPosture.rationale}`;
    case "upb_stack":
      return suite.upbStack.footnote;
    case "close_control":
      return suite.closeControl.footnote;
    default:
      return CHART_TITLES[id];
  }
}

export function pickLiveVisuals(chartIds: ChartId[]): ChartId[] {
  const charts = chartIds.filter((id) => visualKind(id) === "chart");
  const infographics = chartIds.filter((id) => visualKind(id) === "infographic");
  const tables = chartIds.filter((id) => visualKind(id) === "table");
  const live: ChartId[] = [...charts];
  if (live.length < LIVE_VISUAL_MIN) live.push(...infographics);
  if (live.length < LIVE_VISUAL_MIN) live.push(...tables);
  return live.slice(0, LIVE_VISUAL_MAX);
}

export function chunkVisuals(ids: ChartId[]): ChartId[][] {
  if (ids.length <= 3) return ids.length ? [ids] : [];
  return [ids.slice(0, 2), ids.slice(2)];
}

function kpiFromCitation(c: NarrativeCitation, soWhat?: string): PackKpi {
  return {
    label: c.label,
    value: c.value,
    hint: soWhat ?? `${c.unit} · ${c.source}${c.noiDefinition ? ` · ${c.noiDefinition}` : ""}`,
    soWhat,
  };
}

function citationsById(narrative: AudienceNarrative): Map<string, NarrativeCitation> {
  return new Map(narrative.citations.map((c) => [c.id, c]));
}

function kpiSoWhat(id: AudienceKpiId, snap: PeriodSnapshot, citation: NarrativeCitation): string {
  switch (id) {
    case "look_through_noi":
    case "noi":
      return snap.noiVarianceCents === null
        ? "Period NOI. No monthly budget posted."
        : snap.noiVarianceCents >= 0n
          ? `${formatUsd(snap.noiVarianceCents)} above plan this period.`
          : `${formatUsd(-snap.noiVarianceCents)} below plan this period.`;
    case "noi_per_unit":
      return `Across ${snap.unitCount || "—"} units. Period NOI ÷ unit count.`;
    case "occupancy":
      return snap.physicalOccupancyBps === null || snap.breakevenOccupancyBps === null
        ? citation.source
        : `Physical occupancy is ${pp(snap.physicalOccupancyBps - snap.breakevenOccupancyBps)} ${snap.physicalOccupancyBps >= snap.breakevenOccupancyBps ? "above" : "below"} breakeven.`;
    case "budget_variance":
      return snap.budgetNoiCents === null ? "No monthly budget posted." : `Versus budget ${formatUsd(snap.budgetNoiCents)}.`;
    case "liquidity":
      return `Cash covers ${formatMonthsCoverage(snap.liquidityMonthsHundredths)} of period OpEx.`;
    case "dscr":
      return `Versus ${formatBpsAsMultiple(snap.dscrThresholdBps)} threshold.`;
    case "debt_yield":
      return `Annualized period NOI ÷ UPB — not T12.`;
    case "reserves":
      return `Monthly requirement ${formatUsd(snap.reserveRequirementCents)}.`;
    case "upb":
      return "Loan file. Not LTV.";
    case "t12_status":
      return snap.t12Complete ? "T12 is 12/12." : "Incomplete T12 is not annualized.";
    case "recommendation":
      return icRecommendation(snap).rationale;
    case "close_status":
      return "Close /close before anything ships.";
    case "covenant_watch":
      return "Fails only.";
    case "cfads":
      return audienceCfads(snap, "gp").hint;
    case "lp_share":
      return snap.waterfallApplied
        ? "Same SPE waterfall as OpCo — not 100% look-through."
        : "No template saved; RCP look-through.";
    case "gp_promote":
      return snap.waterfallApplied ? "GP/RCP promote + co-invest after waterfall." : "100% look-through until a template is saved.";
    case "lp_pref_unpaid":
      return "Preferred return still owed to LP-class.";
    case "capex":
      return `Reserve cash ${formatUsd(snap.cashReserveCents)}.`;
    case "fee_income":
      return "Fee income is not property cash.";
    default:
      return citation.source;
  }
}

function execKpis(narrative: AudienceNarrative, snap: PeriodSnapshot): PackKpi[] {
  const byId = citationsById(narrative);
  const ids = EXEC_KPI_IDS[narrative.audience];
  return ids
    .map((id) => {
      const c = byId.get(id);
      if (!c) return null;
      return kpiFromCitation(c, kpiSoWhat(id, snap, c));
    })
    .filter((k): k is PackKpi => Boolean(k))
    .slice(0, LIVE_KPI_MAX);
}

function extraKpis(narrative: AudienceNarrative, used: PackKpi[]): PackKpi[] {
  const usedLabels = new Set(used.map((k) => k.label));
  return narrative.citations.filter((c) => !usedLabels.has(c.label)).map((c) => kpiFromCitation(c));
}

export type ExecThesis = { insight: string; proofLabel: string; proofValue: string; bullets: string[] };

export function execThesis(snap: PeriodSnapshot, audience: AudienceId): ExecThesis {
  const noi = formatUsd(snap.noiCents);
  const t12 = snap.t12Complete
    ? `T12 NOI is ${formatUsd(snap.t12NoiCents)} (12/12).`
    : `T12 is ${snap.t12MonthsAvailable}/12 months and is not annualized.`;
  const occ =
    snap.physicalOccupancyBps === null
      ? "Physical occupancy needs a rent roll."
      : `Physical occupancy is ${formatBpsAsPercent(snap.physicalOccupancyBps)}.`;
  const plan =
    snap.noiVarianceCents === null || snap.budgetNoiCents === null
      ? `No monthly budget is posted for ${snap.period}.`
      : snap.noiVarianceCents >= 0n
        ? `Period NOI is ${formatUsd(snap.noiVarianceCents)} above plan.`
        : `Period NOI is ${formatUsd(-snap.noiVarianceCents)} below plan.`;

  switch (audience) {
    case "lp":
      return {
        insight:
          snap.noiVarianceCents !== null && snap.noiVarianceCents >= 0n
            ? `Period NOI is ${noi}, ahead of plan.`
            : snap.noiVarianceCents !== null
              ? `Period NOI is ${noi}, short of plan.`
              : `Period NOI is ${noi} on this file.`,
        proofLabel: "NOI / unit",
        proofValue: formatUsdOrDash(snap.noiPerUnitCents),
        bullets: [plan, occ, t12, `AM fees of ${formatUsd(snap.amFeesCents)} sit below NOI.`],
      };
    case "gp":
      return {
        insight: `Intervene on occupancy and controllable OpEx this month.`,
        proofLabel: "Period NOI",
        proofValue: noi,
        bullets: [
          occ,
          `Controllable OpEx is ${formatUsd(snap.controllableOpexCents)}.`,
          gpDistributionSentence(snap),
          plan,
        ],
      };
    case "ic": {
      const rec = icRecommendation(snap);
      return {
        insight: `${rec.action}: ${rec.rationale}`,
        proofLabel: "Period NOI",
        proofValue: noi,
        bullets: [
          `DSCR ${formatBpsAsMultiple(snap.dscrBps)} vs ${formatBpsAsMultiple(snap.dscrThresholdBps)}.`,
          occ,
          t12,
          "Annualized period NOI is the debt-yield numerator only — not T12.",
        ],
      };
    }
    case "lender":
      return {
        insight:
          snap.dscrPass === false
            ? `DSCR is below threshold — coverage is out of covenant.`
            : `Coverage is in covenant this period.`,
        proofLabel: "DSCR",
        proofValue: formatBpsAsMultiple(snap.dscrBps),
        bullets: [
          `Debt yield ${formatBpsAsYield(snap.debtYieldBps)} vs ${formatBpsAsYield(snap.debtYieldThresholdBps)}.`,
          occ,
          `Reserve cash is ${formatUsd(snap.cashReserveCents)} versus a ${formatUsd(snap.reserveRequirementCents)} monthly requirement.`,
          t12,
        ],
      };
    case "mgmt":
      return {
        insight: `Period close is ${snap.closeStatus.replaceAll("_", " ")} — do not ship a pack that puts AM inside NOI.`,
        proofLabel: "Period NOI",
        proofValue: noi,
        bullets: [
          plan,
          occ,
          `AM fees of ${formatUsd(snap.amFeesCents)} sit below NOI.`,
          snap.rollupIsNotGaap
            ? "OpCo combined roll-up is not a GAAP consolidation."
            : "Standalone SPE presentation.",
        ],
      };
  }
}

function watchProof(snap: PeriodSnapshot, suite: ChartSuite): string {
  const fails = suite.covenantWatchlist.rows.filter((r) => r.tone === "fail");
  return fails.length ? fails.map((r) => `${r.label}: ${r.reason}`).join("; ") : "No covenant fails this period.";
}

export function execRisks(snap: PeriodSnapshot, audience: AudienceId, suite: ChartSuite): { items: PackRiskItem[]; ask: string } {
  const watch = watchProof(snap, suite);
  switch (audience) {
    case "lp":
      return {
        items: [
          {
            heading: "Capital at risk",
            body:
              snap.entityType === "OPCO"
                ? "Look-through NOI is concentrated in the SPE stack — not a GAAP consolidation."
                : "This SPE is a single-asset file. Concentration is 100% here, not a diversification claim.",
            proof: `Liquidity ${formatMonthsCoverage(snap.liquidityMonthsHundredths)}`,
          },
          {
            heading: "Covenant watch",
            body: "Fails only. DSCR fail has no LP cure path on this page.",
            proof: watch,
          },
        ],
        ask: snap.waterfallApplied
          ? `No capital call is posted. ${waterfallSplitSentence(snap)} LP share ${formatUsd(audienceCfads(snap, "lp").cents)} is the distributions proxy for this pack — not gross SPE CFADS.`
          : `No capital call is posted. CFADS of ${formatUsd(audienceCfads(snap, "lp").cents)} is a distributions proxy, not an investor distribution.`,
      };
    case "gp":
      return {
        items: [
          {
            heading: "Site lever",
            body: `Controllable OpEx is ${formatUsd(snap.controllableOpexCents)}. CapEx ${formatUsd(snap.periodCapexCents)} vs reserve cash ${formatUsd(snap.cashReserveCents)}.`,
            proof: formatUsd(snap.controllableOpexCents),
          },
          {
            heading: "Watchlist",
            body: "Reason codes only — not a lender memo.",
            proof: watch,
          },
        ],
        ask: "Intervene on the problem-child SPE this month. Fee income is not property cash.",
      };
    case "ic":
      return {
        items: [
          {
            heading: "Falsifiers",
            body: "Silent T12 annualization, unlabeled debt-yield NOI, or a DSCR print with no mitigation moves this file.",
            proof: watch,
          },
          {
            heading: "LTV",
            body: snap.ltvReason,
            proof: "Gated — no live LTV",
          },
        ],
        ask: `${icRecommendation(snap).action} stands unless a falsifier is posted.`,
      };
    case "lender":
      return {
        items: [
          {
            heading: "In covenant?",
            body: `DSCR ${formatBpsAsMultiple(snap.dscrBps)} vs ${formatBpsAsMultiple(snap.dscrThresholdBps)}. Debt yield ${formatBpsAsYield(snap.debtYieldBps)}.`,
            proof: watch,
          },
          {
            heading: "Cure path",
            body:
              snap.dscrPass === false || snap.debtYieldPass === false
                ? "No equity, rate relief, or principal paydown is posted. State a cure or treat as uncured."
                : "No coverage fail this period; no cure is required.",
            proof: `UPB ${formatUsd(snap.upbCents)}`,
          },
        ],
        ask: "LTV is not stated without appraisal. OpCo fee is not property cash.",
      };
    case "mgmt":
      return {
        items: [
          {
            heading: "Ship blockers",
            body: "Do not circulate AM-inside-NOI, a GAAP consolidation claim, or gated LTV as a live ratio.",
            proof: watch,
          },
          {
            heading: "Close",
            body: `Period close is ${snap.closeStatus.replaceAll("_", " ")}. Close /close before anything ships externally.`,
            proof: snap.closeStatus.replaceAll("_", " "),
          },
        ],
        ask: "External ship list: LP stewardship pack, lender covenant memo, IC go/hold/kill. Not a CoA dump.",
      };
  }
}

function appendixTables(snap: PeriodSnapshot, suite: ChartSuite, leftover: ChartId[]): PackAppendixTable[] {
  const tables: PackAppendixTable[] = [];
  if (snap.waterfallApplied) {
    tables.push({
      title: "Deal waterfall (same config as OpCo)",
      soWhat: waterfallSplitSentence(snap),
      headers: ["Slice", "Amount"],
      rows: [
        ["CFADS pool (look-through)", formatUsd(snap.cfadsLookThroughCents)],
        ["LP share after waterfall", formatUsd(snap.lpShareOfDistributableCents)],
        ["GP/RCP after waterfall", formatUsd(snap.rcpShareOfDistributableCents)],
        ...(snap.coGpShareOfDistributableCents > 0n
          ? ([["Co-GP after waterfall", formatUsd(snap.coGpShareOfDistributableCents)]] as [string, string][])
          : []),
        ["ROC to LP", formatUsd(snap.waterfallRocLpCents)],
        ["Pref paid to LP", formatUsd(snap.waterfallPrefPaidLpCents)],
        ["GP catch-up", formatUsd(snap.waterfallCatchUpGpCents)],
        ["GP residual promote", formatUsd(snap.waterfallPromoteGpCents)],
        ["LP residual", formatUsd(snap.waterfallResidualLpCents)],
        ["LP pref unpaid", formatUsd(snap.lpPrefUnpaidCents)],
      ],
    });
  }
  if (leftover.includes("portfolio_heatmap")) {
    tables.push({
      title: suite.heatmap.title,
      soWhat: chartSoWhat("portfolio_heatmap", snap, suite),
      headers: ["SPE", ...suite.heatmap.spec.cols.map((c) => c.label)],
      rows: suite.heatmap.spec.rows.map((row) => [
        row.label,
        ...suite.heatmap.spec.cols.map((col) => {
          const cell = suite.heatmap.spec.cells.find((c) => c.rowKey === row.key && c.colKey === col.key);
          return cell?.display ?? "—";
        }),
      ]),
    });
  }
  if (leftover.includes("covenant_watchlist")) {
    tables.push({
      title: suite.covenantWatchlist.title,
      soWhat: chartSoWhat("covenant_watchlist", snap, suite),
      headers: ["Item", "Reason"],
      rows: suite.covenantWatchlist.rows.map((r) => [r.label, r.reason]),
    });
  }
  return tables;
}

function appendixCallouts(
  snap: PeriodSnapshot,
  suite: ChartSuite,
  leftover: ChartId[],
): { title: string; body: string; soWhat: string }[] {
  const out: { title: string; body: string; soWhat: string }[] = [];
  if (leftover.includes("t12_status")) {
    out.push({
      title: suite.t12Status.title,
      body: snap.t12Complete
        ? `T12 ready · ${suite.t12Status.monthsAvailable}/12 · ${formatUsd(snap.t12NoiCents)}`
        : `T12 incomplete · ${suite.t12Status.monthsAvailable}/12 · not annualized`,
      soWhat: chartSoWhat("t12_status", snap, suite),
    });
  }
  if (leftover.includes("decision_posture")) {
    out.push({
      title: suite.decisionPosture.title,
      body: `${suite.decisionPosture.action} — ${suite.decisionPosture.rationale}`,
      soWhat: chartSoWhat("decision_posture", snap, suite),
    });
  }
  if (leftover.includes("close_control")) {
    out.push({
      title: suite.closeControl.title,
      body: suite.closeControl.rows.map((r) => `${r.label}: ${r.display}`).join(" · "),
      soWhat: chartSoWhat("close_control", snap, suite),
    });
  }
  return out;
}

function commonDisclosures(snap: PeriodSnapshot): string[] {
  return [
    snap.entityCode === "SPE-WBG" || snap.entityCode === "RCP-OPCO"
      ? `Seed / demo disclaimer: ${snap.entityCode} demo months. T12 incomplete is not annualized.`
      : `Book basis · USD · en-US · America/New_York · integer cents. Period ${snap.period}.`,
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
    "CFADS is a distributions proxy, not a posted investor distribution. Saved deal waterfalls split CFADS into LP share vs GP/RCP; OpCo cash/CFADS and the Monthly Investor Pack use that same config. Default is 100% look-through.",
    "No live PMS or bank feed. Charts reprint the same period snapshot as the narratives.",
    "Soft-archived SPEs are excluded from live financial packs and OpCo combined roll-up.",
  ];
}

export function buildPackSlides(opts: {
  snap: PeriodSnapshot;
  audience: AudienceId;
  packTitle: string;
  chartIds: ChartId[];
  narrative: AudienceNarrative;
  charts: ChartSuite;
}): PackSlide[] {
  const { snap, audience, packTitle, chartIds, narrative, charts } = opts;
  const thesis = execThesis(snap, audience);
  const kpis = execKpis(narrative, snap);
  const risks = execRisks(snap, audience, charts);
  const liveIds = pickLiveVisuals(chartIds);
  const leftover = chartIds.filter((id) => !liveIds.includes(id));
  const visualChunks = chunkVisuals(liveIds);

  const cover: PackSlide = {
    kind: "cover",
    title: packTitle,
    subtitle: `${snap.entityName} · ${periodLabel(snap.period)}`,
    audienceLabel: AUDIENCE_LABELS[audience],
    thesis: thesis.insight,
    proofLabel: thesis.proofLabel,
    proofValue: thesis.proofValue,
    bullets: [
      `${snap.entityName} · ${snap.entityCode}`,
      periodLabel(snap.period),
      snap.viewLabel,
      `Audience: ${AUDIENCE_LABELS[audience]}`,
    ],
  };

  const slides: PackSlide[] = [
    cover,
    { kind: "kpis", title: `${AUDIENCE_LABELS[audience]} — period snapshot`, kpis },
    {
      kind: "thesis",
      title: AUDIENCE_BRIEFS[audience].title,
      insight: thesis.insight,
      proof: `${thesis.proofLabel} ${thesis.proofValue}`,
      bullets: thesis.bullets,
    },
  ];

  const visualTitles = ["Proof in the numbers", "What moved"];
  visualChunks.forEach((chunk, i) => {
    slides.push({
      kind: "visuals",
      title: visualChunks.length === 1 ? "Insight visuals" : (visualTitles[i] ?? "Insight visuals"),
      visuals: chunk.map((chartId) => ({
        chartId,
        title: CHART_TITLES[chartId],
        soWhat: chartSoWhat(chartId, snap, charts),
        mode: visualKind(chartId),
      })),
    });
  });

  slides.push({
    kind: "risks",
    title: audience === "lp" || audience === "gp" ? "Risks and the ask" : audience === "lender" ? "Covenant, cure, collateral" : audience === "ic" ? "Falsifiers and the call" : "Risks before we ship",
    items: risks.items,
    ask: risks.ask,
  });

  slides.push({
    kind: "appendix",
    title: "Appendix — method, remaining KPIs, disclosures",
    bullets: commonDisclosures(snap),
    extraKpis: extraKpis(narrative, kpis),
    tables: appendixTables(snap, charts, leftover),
    callouts: appendixCallouts(snap, charts, leftover),
  });

  return slides.slice(0, LIVE_DECK_MAX_SLIDES);
}

export function liveSpineKinds(slides: PackSlide[]): PackSpineKind[] {
  const kinds: PackSpineKind[] = [];
  for (const slide of slides) {
    if (kinds[kinds.length - 1] !== slide.kind) kinds.push(slide.kind);
  }
  return kinds;
}
