import type { PeriodSnapshot } from "./snapshot-types";
import { centsToUsdNumber, formatBpsAsMultiple, formatBpsAsPercent, formatMonthsCoverage, formatUsd } from "./formatters";

export const CHART_IDS = [
  "waterfall_gpr_noi_btcf",
  "trends_noi_occupancy_opex_dscr",
  "opex_composition",
  "capex_vs_reserves",
  "debt_maturity_wall",
  "portfolio_concentration",
  "actual_vs_budget_bridge",
  "bs_composition",
  "portfolio_heatmap",
  "coverage_vs_threshold",
  "occupancy_breakeven",
  "liquidity_runway",
  "fee_vs_noi",
] as const;

export type ChartId = (typeof CHART_IDS)[number];

export const CHART_TITLES: Record<ChartId, string> = {
  waterfall_gpr_noi_btcf: "GPR → NOI → BTCF waterfall",
  trends_noi_occupancy_opex_dscr: "NOI / occupancy / OpEx ratio / DSCR trends",
  opex_composition: "OpEx composition",
  capex_vs_reserves: "CapEx vs reserves",
  debt_maturity_wall: "Debt maturity wall",
  portfolio_concentration: "NOI concentration",
  actual_vs_budget_bridge: "Actual vs budget NOI bridge",
  bs_composition: "Balance-sheet composition",
  portfolio_heatmap: "Portfolio heatmap",
  coverage_vs_threshold: "DSCR / debt yield vs threshold",
  occupancy_breakeven: "Occupancy vs breakeven",
  liquidity_runway: "Liquidity months",
  fee_vs_noi: "Fee income vs NOI",
};

export type WaterfallBar = {
  key: string;
  label: string;
  valueUsd: number;
  baseUsd: number;
  signedCents: bigint;
  kind: "inflow" | "outflow" | "total";
};

export type TrendSeries = {
  period: string;
  noiUsd: number;
  occupancyPct: number | null;
  opexRatioPct: number | null;
  dscrX: number | null;
};

export type SliceBar = {
  key: string;
  label: string;
  usd: number;
  cents: bigint;
  shareBps: number | null;
};

export type NamedAmount = {
  key: string;
  label: string;
  usd: number;
  cents: bigint;
};

export type HeatmapSpec = {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  cells: {
    rowKey: string;
    colKey: string;
    display: string;
    tone: "good" | "watch" | "fail" | "neutral" | "gated";
  }[];
};

export type ChartSuite = {
  waterfall: { title: string; bars: WaterfallBar[]; footnote: string };
  trends: { title: string; points: TrendSeries[]; occupancyNote: string };
  opexComposition: { title: string; slices: SliceBar[] };
  capexVsReserves: { title: string; bars: NamedAmount[]; footnote: string };
  maturityWall: { title: string; bars: NamedAmount[] };
  concentration: { title: string; slices: SliceBar[]; footnote: string };
  budgetBridge: { title: string; bars: WaterfallBar[]; footnote: string };
  bsComposition: {
    title: string;
    assets: SliceBar[];
    liabilities: SliceBar[];
    equity: SliceBar[];
    footnote: string;
  };
  heatmap: { title: string; spec: HeatmapSpec };
  coverageVsThreshold: {
    title: string;
    footnote: string;
    rows: { key: string; label: string; actual: number; threshold: number; unit: string; pass: boolean | null }[];
  };
  occupancyBreakeven: {
    title: string;
    footnote: string;
    rows: { key: string; label: string; pct: number | null }[];
  };
  liquidityRunway: { title: string; footnote: string; months: number | null; bars: NamedAmount[] };
  feeVsNoi: { title: string; footnote: string; bars: NamedAmount[] };
};

function share(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  return Number((part * 10_000n) / whole);
}

function waterfallFromSteps(
  steps: { key: string; label: string; cents: bigint; kind: WaterfallBar["kind"] }[],
): WaterfallBar[] {
  let running = 0n;
  return steps.map((step) => {
    if (step.kind === "total") {
      const value = step.cents;
      const bar: WaterfallBar = {
        key: step.key,
        label: step.label,
        valueUsd: centsToUsdNumber(value < 0n ? -value : value),
        baseUsd: 0,
        signedCents: value,
        kind: "total",
      };
      running = value;
      return bar;
    }
    const signed = step.kind === "outflow" ? -step.cents : step.cents;
    const start = signed >= 0n ? running : running + signed;
    const mag = signed >= 0n ? signed : -signed;
    const bar: WaterfallBar = {
      key: step.key,
      label: step.label,
      valueUsd: centsToUsdNumber(mag),
      baseUsd: centsToUsdNumber(start < 0n ? 0n : start),
      signedCents: signed,
      kind: step.kind,
    };
    running += signed;
    return bar;
  });
}

export function buildGprNoiBtcfWaterfall(snap: PeriodSnapshot): ChartSuite["waterfall"] {
  const bars = waterfallFromSteps([
    { key: "gpr", label: "GPR", cents: snap.gprCents, kind: "total" },
    { key: "vac", label: "Vacancy", cents: snap.vacancyCents, kind: "outflow" },
    { key: "conc", label: "Concessions", cents: snap.concessionsCents, kind: "outflow" },
    { key: "egr", label: "EGR", cents: snap.egrCents, kind: "total" },
    { key: "oi", label: "Other income", cents: snap.otherIncomeCents, kind: "inflow" },
    { key: "egi", label: "EGI", cents: snap.egiCents, kind: "total" },
    { key: "ox", label: "OpEx", cents: snap.opexCents, kind: "outflow" },
    { key: "noi", label: "NOI", cents: snap.noiCents, kind: "total" },
    { key: "int", label: "Interest", cents: snap.interestCents, kind: "outflow" },
    { key: "prin", label: "Principal", cents: snap.principalCents, kind: "outflow" },
    { key: "btcf", label: "BTCF", cents: snap.btcfCents, kind: "total" },
  ]);
  return {
    title: CHART_TITLES.waterfall_gpr_noi_btcf,
    bars,
    footnote: `BTCF = period NOI − interest − principal. AM fees ${formatUsd(snap.amFeesCents)} sit below NOI and are not in BTCF. Depreciation ${formatUsd(snap.depreciationCents)} is non-cash.`,
  };
}

export function buildTrendSeries(snap: PeriodSnapshot): ChartSuite["trends"] {
  return {
    title: CHART_TITLES.trends_noi_occupancy_opex_dscr,
    points: snap.trends.map((t) => ({
      period: t.period,
      noiUsd: centsToUsdNumber(t.noiCents),
      occupancyPct: t.bookEconomicOccupancyBps === null ? null : t.bookEconomicOccupancyBps / 100,
      opexRatioPct: t.opexRatioBps === null ? null : t.opexRatioBps / 100,
      dscrX: t.dscrBps === null ? null : t.dscrBps / 10_000,
    })),
    occupancyNote:
      snap.physicalOccupancyBps === null
        ? "Occupancy trend is book economic occupancy (EGI / GPR). Physical occupancy needs a rent roll and is a point-in-time file, not a monthly series."
        : `Occupancy trend is book economic occupancy (EGI / GPR). Current-period physical occupancy is ${formatBpsAsPercent(snap.physicalOccupancyBps)} from the rent roll (${snap.occupiedCount ?? 0} / ${snap.rentableCount ?? 0} rentable).`,
  };
}

export function buildOpexComposition(snap: PeriodSnapshot): ChartSuite["opexComposition"] {
  const whole = snap.opexLines.reduce((acc, l) => acc + l.actualCents, 0n);
  return {
    title: CHART_TITLES.opex_composition,
    slices: snap.opexLines
      .filter((l) => l.actualCents !== 0n)
      .map((l) => ({
        key: l.key,
        label: l.label,
        usd: centsToUsdNumber(l.actualCents),
        cents: l.actualCents,
        shareBps: share(l.actualCents, whole),
      })),
  };
}

export function buildCapexVsReserves(snap: PeriodSnapshot): ChartSuite["capexVsReserves"] {
  return {
    title: CHART_TITLES.capex_vs_reserves,
    bars: [
      { key: "capex", label: "Period PPE additions", usd: centsToUsdNumber(snap.periodCapexCents), cents: snap.periodCapexCents },
      { key: "reserve_cash", label: "Reserve cash (1020)", usd: centsToUsdNumber(snap.cashReserveCents), cents: snap.cashReserveCents },
      {
        key: "reserve_req",
        label: "Monthly reserve requirement",
        usd: centsToUsdNumber(snap.reserveRequirementCents),
        cents: snap.reserveRequirementCents,
      },
    ],
    footnote: `CFADS (distributions proxy) ${formatUsd(snap.cfadsCents)} = period NOI − PPE additions − reserve requirement. Not an actual distribution.`,
  };
}

export function buildMaturityWall(snap: PeriodSnapshot): ChartSuite["maturityWall"] {
  const byYear = new Map<string, bigint>();
  for (const loan of snap.loans) {
    const year = loan.maturityDate.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0n) + loan.currentUpbCents);
  }
  const bars = [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, cents]) => ({
      key: year,
      label: year,
      usd: centsToUsdNumber(cents),
      cents,
    }));
  return { title: CHART_TITLES.debt_maturity_wall, bars };
}

export function buildConcentration(snap: PeriodSnapshot): ChartSuite["concentration"] {
  const rows = snap.concentration.length
    ? snap.concentration
    : [
        {
          entityCode: snap.entityCode,
          entityName: snap.entityName,
          noiCents: snap.noiCents,
          shareBps: 10_000,
          unitCount: snap.unitCount,
          opexRatioBps: snap.opexRatioBps,
          bookEconomicOccupancyBps: snap.bookEconomicOccupancyBps,
          physicalOccupancyBps: snap.physicalOccupancyBps,
          dscrBps: snap.dscrBps,
          dscrPass: snap.dscrPass,
        },
      ];
  const whole = rows.reduce((acc, r) => acc + r.noiCents, 0n);
  return {
    title: CHART_TITLES.portfolio_concentration,
    slices: rows.map((r) => ({
      key: r.entityCode,
      label: r.entityCode,
      usd: centsToUsdNumber(r.noiCents),
      cents: r.noiCents,
      shareBps: r.shareBps ?? share(r.noiCents, whole),
    })),
    footnote: snap.rollupIsNotGaap
      ? "Shares are look-through SPE period NOI. Combined roll-up is not a GAAP consolidation."
      : "Standalone SPE share of its own period NOI.",
  };
}

export function buildBudgetBridge(snap: PeriodSnapshot): ChartSuite["budgetBridge"] {
  if (snap.budgetNoiCents === null) {
    return {
      title: CHART_TITLES.actual_vs_budget_bridge,
      bars: [
        {
          key: "actual",
          label: "Actual NOI",
          valueUsd: centsToUsdNumber(snap.noiCents),
          baseUsd: 0,
          signedCents: snap.noiCents,
          kind: "total",
        },
      ],
      footnote: "No monthly budget is posted for this period.",
    };
  }
  const gprImpact = snap.gprCents - (snap.budgetGprCents ?? 0n);
  const vacImpact = (snap.budgetVacancyCents ?? 0n) - snap.vacancyCents;
  const concImpact = (snap.budgetConcessionsCents ?? 0n) - snap.concessionsCents;
  const oiImpact = snap.otherIncomeCents - (snap.budgetOtherIncomeCents ?? 0n);
  const oxImpact = (snap.budgetOpexCents ?? 0n) - snap.opexCents;
  const bars = waterfallFromSteps([
    { key: "bud", label: "Budget NOI", cents: snap.budgetNoiCents, kind: "total" },
    { key: "gpr", label: "GPR Δ", cents: gprImpact < 0n ? -gprImpact : gprImpact, kind: gprImpact < 0n ? "outflow" : "inflow" },
    { key: "vac", label: "Vacancy Δ", cents: vacImpact < 0n ? -vacImpact : vacImpact, kind: vacImpact < 0n ? "outflow" : "inflow" },
    { key: "conc", label: "Concessions Δ", cents: concImpact < 0n ? -concImpact : concImpact, kind: concImpact < 0n ? "outflow" : "inflow" },
    { key: "oi", label: "Other income Δ", cents: oiImpact < 0n ? -oiImpact : oiImpact, kind: oiImpact < 0n ? "outflow" : "inflow" },
    { key: "ox", label: "OpEx Δ", cents: oxImpact < 0n ? -oxImpact : oxImpact, kind: oxImpact < 0n ? "outflow" : "inflow" },
    { key: "act", label: "Actual NOI", cents: snap.noiCents, kind: "total" },
  ]);
  return {
    title: CHART_TITLES.actual_vs_budget_bridge,
    bars,
    footnote: `NOI variance ${formatUsd(snap.noiVarianceCents ?? 0n)} (${formatBpsAsPercent(snap.noiVarianceBps)} vs budget). Revenue Δ is actual − budget; expense Δ is the NOI impact (budget − actual).`,
  };
}

function toSlices(items: { key: string; label: string; cents: bigint }[], whole: bigint): SliceBar[] {
  return items
    .filter((i) => i.cents !== 0n)
    .map((i) => ({
      key: i.key,
      label: i.label,
      usd: centsToUsdNumber(i.cents < 0n ? -i.cents : i.cents),
      cents: i.cents,
      shareBps: share(i.cents < 0n ? -i.cents : i.cents, whole < 0n ? -whole : whole),
    }));
}

export function buildBsComposition(snap: PeriodSnapshot): ChartSuite["bsComposition"] {
  return {
    title: CHART_TITLES.bs_composition,
    assets: toSlices(snap.bsAssets, snap.bsTotalAssetsCents),
    liabilities: toSlices(snap.bsLiabilities, snap.bsTotalLiabilitiesCents),
    equity: toSlices(snap.bsEquity, snap.bsTotalEquityCents),
    footnote: snap.bsBalanced
      ? `A = L + E · assets ${formatUsd(snap.bsTotalAssetsCents)}.`
      : "Balance sheet is out of balance — do not circulate.",
  };
}

export function buildHeatmap(snap: PeriodSnapshot): ChartSuite["heatmap"] {
  const rows = (snap.concentration.length
    ? snap.concentration
    : [
        {
          entityCode: snap.entityCode,
          entityName: snap.entityName,
          noiCents: snap.noiCents,
          shareBps: 10_000,
          unitCount: snap.unitCount,
          opexRatioBps: snap.opexRatioBps,
          bookEconomicOccupancyBps: snap.bookEconomicOccupancyBps,
          physicalOccupancyBps: snap.physicalOccupancyBps,
          dscrBps: snap.dscrBps,
          dscrPass: snap.dscrPass,
        },
      ]);
  const cols = [
    { key: "share", label: "NOI share" },
    { key: "occ", label: "Occ. (book)" },
    { key: "opex", label: "OpEx ratio" },
    { key: "dscr", label: "DSCR" },
    { key: "ltv", label: "LTV" },
  ];
  const cells: HeatmapSpec["cells"] = [];
  for (const row of rows) {
    cells.push({
      rowKey: row.entityCode,
      colKey: "share",
      display: formatBpsAsPercent(row.shareBps),
      tone: (row.shareBps ?? 0) >= 5_000 ? "watch" : "neutral",
    });
    cells.push({
      rowKey: row.entityCode,
      colKey: "occ",
      display: formatBpsAsPercent(row.bookEconomicOccupancyBps),
      tone: "neutral",
    });
    cells.push({
      rowKey: row.entityCode,
      colKey: "opex",
      display: formatBpsAsPercent(row.opexRatioBps),
      tone: "neutral",
    });
    cells.push({
      rowKey: row.entityCode,
      colKey: "dscr",
      display: formatBpsAsMultiple(row.dscrBps),
      tone: row.dscrPass === false ? "fail" : row.dscrPass === true ? "good" : "neutral",
    });
    cells.push({
      rowKey: row.entityCode,
      colKey: "ltv",
      display: "Gated",
      tone: "gated",
    });
  }
  return {
    title: CHART_TITLES.portfolio_heatmap,
    spec: {
      rows: rows.map((row) => ({ key: row.entityCode, label: row.entityCode })),
      cols,
      cells,
    },
  };
}

export function buildCoverageVsThreshold(snap: PeriodSnapshot): ChartSuite["coverageVsThreshold"] {
  return {
    title: CHART_TITLES.coverage_vs_threshold,
    footnote: "DSCR is period NOI ÷ (interest + principal). Debt yield is annualized period NOI ÷ UPB — not T12. LTV stays gated.",
    rows: [
      {
        key: "dscr",
        label: "DSCR",
        actual: snap.dscrBps === null ? 0 : snap.dscrBps / 10_000,
        threshold: (snap.dscrThresholdBps ?? 0) / 10_000,
        unit: "x",
        pass: snap.dscrPass,
      },
      {
        key: "debt_yield",
        label: "Debt yield",
        actual: snap.debtYieldBps === null ? 0 : snap.debtYieldBps / 100,
        threshold: (snap.debtYieldThresholdBps ?? 0) / 100,
        unit: "%",
        pass: snap.debtYieldPass,
      },
    ],
  };
}

export function buildOccupancyBreakeven(snap: PeriodSnapshot): ChartSuite["occupancyBreakeven"] {
  return {
    title: CHART_TITLES.occupancy_breakeven,
    footnote:
      snap.physicalOccupancyBps === null
        ? "Physical occupancy needs a rent roll. Book economic occupancy is EGI / GPR."
        : `Physical occupancy ${formatBpsAsPercent(snap.physicalOccupancyBps)} vs breakeven ${formatBpsAsPercent(snap.breakevenOccupancyBps)}.`,
    rows: [
      { key: "phys", label: "Physical occ.", pct: snap.physicalOccupancyBps === null ? null : snap.physicalOccupancyBps / 100 },
      { key: "book", label: "Book economic occ.", pct: snap.bookEconomicOccupancyBps === null ? null : snap.bookEconomicOccupancyBps / 100 },
      { key: "be", label: "Breakeven", pct: snap.breakevenOccupancyBps === null ? null : snap.breakevenOccupancyBps / 100 },
    ],
  };
}

export function buildLiquidityRunway(snap: PeriodSnapshot): ChartSuite["liquidityRunway"] {
  return {
    title: CHART_TITLES.liquidity_runway,
    footnote: `Cash ÷ period OpEx. Coverage is ${formatMonthsCoverage(snap.liquidityMonthsHundredths)}.`,
    months: snap.liquidityMonthsHundredths === null ? null : snap.liquidityMonthsHundredths / 100,
    bars: [
      { key: "cash", label: "Total cash", usd: centsToUsdNumber(snap.cashTotalCents), cents: snap.cashTotalCents },
      { key: "opex", label: "Period OpEx", usd: centsToUsdNumber(snap.opexCents), cents: snap.opexCents },
      { key: "reserve", label: "Reserve cash", usd: centsToUsdNumber(snap.cashReserveCents), cents: snap.cashReserveCents },
    ],
  };
}

export function buildFeeVsNoi(snap: PeriodSnapshot): ChartSuite["feeVsNoi"] {
  const fee = snap.feeIncomeCents ?? snap.amFeesCents;
  return {
    title: CHART_TITLES.fee_vs_noi,
    footnote: "AM fees sit below NOI on the SPE. OpCo fee income is the sponsor line, not an in-NOI deduction.",
    bars: [
      { key: "noi", label: "Period NOI", usd: centsToUsdNumber(snap.noiCents), cents: snap.noiCents },
      { key: "fee", label: "Fee / AM line", usd: centsToUsdNumber(fee), cents: fee },
    ],
  };
}

export function buildChartSuite(snap: PeriodSnapshot): ChartSuite {
  return {
    waterfall: buildGprNoiBtcfWaterfall(snap),
    trends: buildTrendSeries(snap),
    opexComposition: buildOpexComposition(snap),
    capexVsReserves: buildCapexVsReserves(snap),
    maturityWall: buildMaturityWall(snap),
    concentration: buildConcentration(snap),
    budgetBridge: buildBudgetBridge(snap),
    bsComposition: buildBsComposition(snap),
    heatmap: buildHeatmap(snap),
    coverageVsThreshold: buildCoverageVsThreshold(snap),
    occupancyBreakeven: buildOccupancyBreakeven(snap),
    liquidityRunway: buildLiquidityRunway(snap),
    feeVsNoi: buildFeeVsNoi(snap),
  };
}

export function serializeChartSuite(suite: ChartSuite): ChartSuite {
  return JSON.parse(JSON.stringify(suite, (_key, value) => (typeof value === "bigint" ? value.toString() : value))) as ChartSuite;
}

export function chartIdsPresent(suite: ChartSuite): ChartId[] {
  const ids: ChartId[] = [];
  if (suite.waterfall.bars.length) ids.push("waterfall_gpr_noi_btcf");
  if (suite.trends.points.length) ids.push("trends_noi_occupancy_opex_dscr");
  if (suite.opexComposition.slices.length) ids.push("opex_composition");
  if (suite.capexVsReserves.bars.length) ids.push("capex_vs_reserves");
  if (suite.maturityWall.bars.length) ids.push("debt_maturity_wall");
  if (suite.concentration.slices.length) ids.push("portfolio_concentration");
  if (suite.budgetBridge.bars.length) ids.push("actual_vs_budget_bridge");
  if (suite.bsComposition.assets.length) ids.push("bs_composition");
  if (suite.heatmap.spec.cells.length) ids.push("portfolio_heatmap");
  if (suite.coverageVsThreshold.rows.length) ids.push("coverage_vs_threshold");
  if (suite.occupancyBreakeven.rows.length) ids.push("occupancy_breakeven");
  if (suite.liquidityRunway.bars.length) ids.push("liquidity_runway");
  if (suite.feeVsNoi.bars.length) ids.push("fee_vs_noi");
  return ids;
}

export function filterChartIds(ids: ChartId[], visible: ChartId[]): ChartId[] {
  const allow = new Set(visible);
  return ids.filter((id) => allow.has(id));
}
