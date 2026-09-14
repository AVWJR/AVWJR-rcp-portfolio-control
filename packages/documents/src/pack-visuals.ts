import type { BuiltPack, ChartSuite, PackVisual, WaterfallBar } from "@rcp/reporting";
import { PACK_PALETTE, seriesColor } from "./pack-theme";

export type ChartSeries = { name: string; labels: string[]; values: number[]; color: string };

export type RenderableVisual =
  | {
      mode: "bars";
      title: string;
      soWhat: string;
      labels: string[];
      series: ChartSeries[];
      stacked?: boolean;
    }
  | {
      mode: "pie";
      title: string;
      soWhat: string;
      labels: string[];
      values: number[];
      colors: string[];
    }
  | {
      mode: "callout";
      title: string;
      soWhat: string;
      kicker: string;
      value: string;
      detail: string;
      tone: "navy" | "gold" | "fail";
    }
  | {
      mode: "table";
      title: string;
      soWhat: string;
      headers: string[];
      rows: string[][];
    }
  | {
      mode: "status";
      title: string;
      soWhat: string;
      items: { label: string; value: string; tone: "pass" | "watch" | "fail" | "neutral" }[];
    };

function waterfallSeries(bars: WaterfallBar[], labels: string[]): ChartSeries[] {
  return [
    {
      name: "Inflow",
      labels,
      values: bars.map((b) => (b.kind === "inflow" ? b.valueUsd : 0)),
      color: PACK_PALETTE.inflow,
    },
    {
      name: "Outflow",
      labels,
      values: bars.map((b) => (b.kind === "outflow" ? b.valueUsd : 0)),
      color: PACK_PALETTE.outflow,
    },
    {
      name: "Total",
      labels,
      values: bars.map((b) => (b.kind === "total" ? b.valueUsd : 0)),
      color: PACK_PALETTE.total,
    },
  ];
}

function colorBars(labels: string[], values: number[], colors?: string[]): ChartSeries[] {
  return labels.map((label, i) => ({
    name: label,
    labels,
    values: labels.map((_, j) => (j === i ? values[i]! : 0)),
    color: colors?.[i] ?? seriesColor(i),
  }));
}

export function toRenderableVisual(pack: BuiltPack, visual: PackVisual): RenderableVisual {
  const suite: ChartSuite = pack.charts;
  const { chartId, title, soWhat } = visual;

  if (chartId === "waterfall_gpr_noi_btcf") {
    const labels = suite.waterfall.bars.map((b) => b.label);
    return { mode: "bars", title, soWhat, labels, series: waterfallSeries(suite.waterfall.bars, labels), stacked: true };
  }
  if (chartId === "actual_vs_budget_bridge") {
    const labels = suite.budgetBridge.bars.map((b) => b.label);
    return { mode: "bars", title, soWhat, labels, series: waterfallSeries(suite.budgetBridge.bars, labels), stacked: true };
  }
  if (chartId === "trends_noi_occupancy_opex_dscr") {
    const labels = suite.trends.points.map((p) => p.period);
    return {
      mode: "bars",
      title,
      soWhat,
      labels,
      series: [
        {
          name: "Period NOI",
          labels,
          values: suite.trends.points.map((p) => p.noiUsd),
          color: PACK_PALETTE.navy,
        },
      ],
    };
  }
  if (chartId === "opex_composition") {
    return {
      mode: "pie",
      title,
      soWhat,
      labels: suite.opexComposition.slices.map((s) => s.label),
      values: suite.opexComposition.slices.map((s) => s.usd),
      colors: suite.opexComposition.slices.map((_, i) => seriesColor(i)),
    };
  }
  if (chartId === "capex_vs_reserves") {
    const labels = suite.capexVsReserves.bars.map((s) => s.label);
    const values = suite.capexVsReserves.bars.map((s) => s.usd);
    return { mode: "bars", title, soWhat, labels, series: colorBars(labels, values), stacked: true };
  }
  if (chartId === "debt_maturity_wall") {
    const labels = suite.maturityWall.bars.map((s) => s.label);
    const values = suite.maturityWall.bars.map((s) => s.usd);
    return { mode: "bars", title, soWhat, labels, series: colorBars(labels, values), stacked: true };
  }
  if (chartId === "portfolio_concentration") {
    if (suite.concentration.slices.length <= 1) {
      const slice = suite.concentration.slices[0];
      return {
        mode: "callout",
        title,
        soWhat,
        kicker: slice?.label ?? pack.entityCode,
        value: "100%",
        detail: soWhat,
        tone: "navy",
      };
    }
    return {
      mode: "pie",
      title,
      soWhat,
      labels: suite.concentration.slices.map((s) => s.label),
      values: suite.concentration.slices.map((s) => s.usd),
      colors: suite.concentration.slices.map((_, i) => seriesColor(i)),
    };
  }
  if (chartId === "bs_composition") {
    return {
      mode: "pie",
      title,
      soWhat,
      labels: suite.bsComposition.assets.map((s) => s.label),
      values: suite.bsComposition.assets.map((s) => s.usd),
      colors: suite.bsComposition.assets.map((_, i) => seriesColor(i)),
    };
  }
  if (chartId === "coverage_vs_threshold") {
    const labels = suite.coverageVsThreshold.rows.map((r) => r.label);
    return {
      mode: "bars",
      title,
      soWhat,
      labels,
      series: [
        {
          name: "Actual",
          labels,
          values: suite.coverageVsThreshold.rows.map((r) => r.actual),
          color: PACK_PALETTE.navy,
        },
        {
          name: "Threshold",
          labels,
          values: suite.coverageVsThreshold.rows.map((r) => r.threshold),
          color: PACK_PALETTE.gold,
        },
      ],
    };
  }
  if (chartId === "occupancy_breakeven") {
    const labels = suite.occupancyBreakeven.rows.map((r) => r.label);
    const values = suite.occupancyBreakeven.rows.map((r) => r.pct ?? 0);
    const colors = [PACK_PALETTE.navy, PACK_PALETTE.inflow, PACK_PALETTE.gold];
    return { mode: "bars", title, soWhat, labels, series: colorBars(labels, values, colors), stacked: true };
  }
  if (chartId === "liquidity_runway") {
    const labels = suite.liquidityRunway.bars.map((s) => s.label);
    const values = suite.liquidityRunway.bars.map((s) => s.usd);
    return { mode: "bars", title, soWhat, labels, series: colorBars(labels, values), stacked: true };
  }
  if (chartId === "fee_vs_noi") {
    const labels = suite.feeVsNoi.bars.map((s) => s.label);
    const values = suite.feeVsNoi.bars.map((s) => s.usd);
    return { mode: "bars", title, soWhat, labels, series: colorBars(labels, values), stacked: true };
  }
  if (chartId === "upb_stack") {
    const labels = suite.upbStack.bars.map((s) => s.label);
    const values = suite.upbStack.bars.map((s) => s.usd);
    return { mode: "bars", title, soWhat, labels, series: colorBars(labels, values), stacked: true };
  }
  if (chartId === "covenant_watchlist") {
    return {
      mode: "table",
      title,
      soWhat,
      headers: ["Item", "Reason"],
      rows: suite.covenantWatchlist.rows.map((r) => [r.label, r.reason]),
    };
  }
  if (chartId === "t12_status") {
    return {
      mode: "callout",
      title,
      soWhat,
      kicker: suite.t12Status.complete ? "T12 ready" : "T12 incomplete",
      value: `${suite.t12Status.monthsAvailable}/12`,
      detail: suite.t12Status.complete ? "Do not relabel period NOI as T12." : "Not annualized. Path-dependent on posted months.",
      tone: suite.t12Status.complete ? "navy" : "gold",
    };
  }
  if (chartId === "decision_posture") {
    return {
      mode: "callout",
      title,
      soWhat,
      kicker: "IC call",
      value: suite.decisionPosture.action,
      detail: suite.decisionPosture.rationale,
      tone: suite.decisionPosture.action === "KILL" ? "fail" : suite.decisionPosture.action === "HOLD" ? "gold" : "navy",
    };
  }
  if (chartId === "close_control") {
    return {
      mode: "status",
      title,
      soWhat,
      items: suite.closeControl.rows.map((r) => ({
        label: r.label,
        value: r.display,
        tone: r.tone === "good" ? "pass" : r.tone === "fail" ? "fail" : r.tone === "watch" ? "watch" : "neutral",
      })),
    };
  }
  if (chartId === "portfolio_heatmap") {
    return {
      mode: "table",
      title,
      soWhat,
      headers: ["SPE", ...suite.heatmap.spec.cols.map((c) => c.label)],
      rows: suite.heatmap.spec.rows.map((row) => [
        row.label,
        ...suite.heatmap.spec.cols.map((col) => {
          const cell = suite.heatmap.spec.cells.find((c) => c.rowKey === row.key && c.colKey === col.key);
          return cell?.display ?? "—";
        }),
      ]),
    };
  }
  return { mode: "callout", title, soWhat, kicker: chartId, value: "—", detail: soWhat, tone: "navy" };
}
