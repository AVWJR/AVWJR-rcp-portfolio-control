import { runOpCoProforma, type DealProformaInput, type OpCoPlatformPrefs } from "@rcp/ledger";
import { evaluateDeal, type Criterion, type CriterionField, type LibraryFact } from "@/lib/library/criteria";
import { FEE_NEEDED, GA_BUDGET_NEEDED } from "@/lib/library/fees";
import type { StaleLevel } from "@/lib/library/staleness";
import { IRR_NOT_AVAILABLE, rateToBps, solveIrr, type IrrCashFlow } from "@/lib/returns/irr";
import {
  dealCashNotes,
  exitValueNeededFor,
  NO_CASH_RETURNED_TO_LP,
  projectDealReturns,
  type DealReturnInput,
  type DealReturnMetrics,
} from "@/lib/returns/project-deal";
import { PROJECTION_LABEL } from "./membership";

export type ModelAssumptions = {
  holdYears: number;
  growthBps: number;
  exitCapRateBps: number | null;
  opcoPrefRateBps: number | null;
  opcoPrefCapitalCents: bigint | null;
  opcoLpSplitBps: number;
  opcoGpSplitBps: number;
};

export type ModelDealInput = {
  code: string;
  name: string;
  dealStatus: string;
  optimizerEligible: boolean;
  flag: string | null;
  stale: StaleLevel;
  metro: string | null;
  state: string | null;
  propertyType: string | null;
  vintageYear: number | null;
  equityRequiredCents: bigint | null;
  dscrBps: number | null;
  debtYieldBps: number | null;
  annualizedNoiCents: bigint | null;
  upbCents: bigint;
  fact: LibraryFact;
  returns: Omit<DealReturnInput, "holdYears" | "growthBps" | "exitEquityProceedsCents" | "exitCapRateBps" | "year1NoiCents" | "upbCents">;
};

export type ModelYear = {
  year: number;
  rcpCents: bigint | null;
  lpCents: bigint | null;
  feeIncomeCents: bigint | null;
};

export type ConcentrationRow = {
  dimension: "Metro" | "State" | "Property type" | "Vintage";
  label: string;
  equityCents: bigint;
  shareBps: number;
  breached: boolean;
};

export type ModelDealResult = {
  code: string;
  name: string;
  dealStatus: string;
  optimizerEligible: boolean;
  flag: string | null;
  stale: StaleLevel;
  excluded: boolean;
  exclusions: string[];
  gap: string | null;
  metrics: DealReturnMetrics | null;
};

export type ModelProjection = {
  label: typeof PROJECTION_LABEL;
  notes: string[];
  years: ModelYear[];
  feeIncomeCents: bigint | null;
  feeAccruedUnpaidCents: bigint | null;
  gaCoverageBps: number | null;
  gaGap: string | null;
  rcpEquityCents: bigint | null;
  rcpCashOnCashBps: number | null;
  rcpAvgCashOnCashBps: number | null;
  rcpIrrBps: number | null;
  rcpIrrNote: string | null;
  rcpEquityMultipleBps: number | null;
  rcpMultipleNote: string | null;
  rcpGap: string | null;
  cashGap: string | null;
  equityRequiredCents: bigint | null;
  lpNetIrrBps: number | null;
  lpIrrNote: string | null;
  lpYear1YieldBps: number | null;
  lpAvgYieldBps: number | null;
  lpIrrMinBps: number | null;
  lpIrrMaxBps: number | null;
  lpIrrGapDeals: string[];
  noLpEquityDeals: string[];
  lpGap: string | null;
  dscrBps: number | null;
  debtYieldBps: number | null;
  concentration: ConcentrationRow[];
  deals: ModelDealResult[];
};

function yieldBps(cash: bigint, equity: bigint): number | null {
  if (equity <= 0n) return null;
  return Number((cash * 10_000n) / equity);
}

function factFromMetrics(fact: LibraryFact, metrics: DealReturnMetrics): LibraryFact {
  const metricGaps: Partial<Record<CriterionField, string>> = { ...fact.metricGaps };
  if (metrics.gap) {
    metricGaps.lpNetIrr = metrics.gap;
    metricGaps.lpCashYield = metrics.gap;
    metricGaps.rcpIrr = metrics.gap;
  } else {
    if (metrics.lpNetIrrBps == null && metrics.lpIrrNote) metricGaps.lpNetIrr = metrics.lpIrrNote;
    if (metrics.rcpIrrBps == null && metrics.rcpIrrNote) metricGaps.rcpIrr = metrics.rcpIrrNote;
  }
  return {
    ...fact,
    lpNetIrrBps: metrics.gap ? null : metrics.lpNetIrrBps,
    lpCashYieldBps: metrics.gap ? null : metrics.lpAvgCashYieldBps,
    rcpIrrBps: metrics.gap ? null : metrics.rcpIrrBps,
    metricGaps,
  };
}

function blank(notes: string[], deals: ModelDealResult[]): ModelProjection {
  return {
    label: PROJECTION_LABEL,
    notes,
    years: [],
    feeIncomeCents: null,
    feeAccruedUnpaidCents: null,
    gaCoverageBps: null,
    gaGap: null,
    rcpEquityCents: null,
    rcpCashOnCashBps: null,
    rcpAvgCashOnCashBps: null,
    rcpIrrBps: null,
    rcpIrrNote: null,
    rcpEquityMultipleBps: null,
    rcpMultipleNote: null,
    rcpGap: null,
    cashGap: null,
    equityRequiredCents: null,
    lpNetIrrBps: null,
    lpIrrNote: null,
    lpYear1YieldBps: null,
    lpAvgYieldBps: null,
    lpIrrMinBps: null,
    lpIrrMaxBps: null,
    lpIrrGapDeals: [],
    noLpEquityDeals: [],
    lpGap: null,
    dscrBps: null,
    debtYieldBps: null,
    concentration: [],
    deals,
  };
}

const DIMENSIONS: { dimension: ConcentrationRow["dimension"]; field: "metro" | "state" | "propertyType" | "vintageYear"; read: (deal: ModelDealInput) => string }[] = [
  { dimension: "Metro", field: "metro", read: (deal) => deal.metro?.trim() || "Not on file" },
  { dimension: "State", field: "state", read: (deal) => deal.state?.trim() || "Not on file" },
  { dimension: "Property type", field: "propertyType", read: (deal) => deal.propertyType?.trim() || "Not on file" },
  { dimension: "Vintage", field: "vintageYear", read: (deal) => (deal.vintageYear == null ? "Not on file" : String(deal.vintageYear)) },
];

function concentration(deals: { input: ModelDealInput; exclusions: { field: string }[] }[]): ConcentrationRow[] {
  const counted = deals.filter((deal) => deal.exclusions.length === 0 && deal.input.dealStatus !== "ARCHIVED");
  const rows: ConcentrationRow[] = [];
  const total = counted.reduce((sum, deal) => sum + (deal.input.equityRequiredCents != null && deal.input.equityRequiredCents > 0n ? deal.input.equityRequiredCents : 0n), 0n);
  for (const dimension of DIMENSIONS) {
    const buckets = new Map<string, { equity: bigint; breached: boolean }>();
    for (const deal of counted) {
      const label = dimension.read(deal.input);
      const current = buckets.get(label) ?? { equity: 0n, breached: false };
      const equity = deal.input.equityRequiredCents != null && deal.input.equityRequiredCents > 0n ? deal.input.equityRequiredCents : 0n;
      current.equity += equity;
      if (deal.exclusions.some((row) => row.field === dimension.field)) current.breached = true;
      buckets.set(label, current);
    }
    for (const [label, bucket] of buckets) {
      const share = total > 0n ? Number((bucket.equity * 10_000n) / total) : 0;
      rows.push({ dimension: dimension.dimension, label, equityCents: bucket.equity, shareBps: share, breached: bucket.breached });
    }
  }
  return rows;
}

function portfolioRatio(deals: ModelDealInput[], kind: "dscr" | "debtYield"): number | null {
  let noi = 0n;
  let denom = 0n;
  for (const deal of deals) {
    const annual = deal.annualizedNoiCents;
    const bps = kind === "dscr" ? deal.dscrBps : deal.debtYieldBps;
    if (annual == null || annual <= 0n || bps == null || bps <= 0) continue;
    noi += annual;
    denom += (annual * 10_000n) / BigInt(bps);
  }
  if (noi <= 0n || denom <= 0n) return null;
  return Number((noi * 10_000n) / denom);
}

export function projectModel(opts: {
  assumptions: ModelAssumptions;
  criteria: Criterion[];
  gaBudgetCents: bigint | null;
  deals: ModelDealInput[];
}): ModelProjection {
  const notes = [PROJECTION_LABEL, "Same waterfall as the live books. This Model does not post journals or change a deal."];
  const metricsByCode = new Map<string, DealReturnMetrics>();
  const prepared = opts.deals.map((input) => {
    const metrics = projectDealReturns({
      ...input.returns,
      holdYears: opts.assumptions.holdYears,
      growthBps: opts.assumptions.growthBps,
      exitEquityProceedsCents: 0n,
      exitCapRateBps: opts.assumptions.exitCapRateBps,
      year1NoiCents: input.annualizedNoiCents ?? 0n,
      upbCents: input.upbCents,
    });
    metricsByCode.set(input.code, metrics);
    return { ...input, fact: factFromMetrics(input.fact, metrics) };
  });
  const evaluated = prepared.map((input) => {
    const exclusions = evaluateDeal(input.fact, opts.criteria);
    if (input.dealStatus === "ARCHIVED") {
      exclusions.unshift({ field: "dealStatus", label: "Status", reason: "Archived deals are view only." });
    }
    return { input, exclusions };
  });
  const passing = evaluated.filter((row) => row.exclusions.length === 0);

  const dealResults: ModelDealResult[] = evaluated.map((row) => ({
    code: row.input.code,
    name: row.input.name,
    dealStatus: row.input.dealStatus,
    optimizerEligible: row.input.optimizerEligible,
    flag: row.input.flag,
    stale: row.input.stale,
    excluded: row.exclusions.length > 0,
    exclusions: row.exclusions.map((item) => item.reason),
    gap: metricsByCode.get(row.input.code)?.gap ?? null,
    metrics: metricsByCode.get(row.input.code) ?? null,
  }));

  const conc = concentration(evaluated);
  if (!passing.length) {
    const empty = blank([...notes, "No deals pass the hard limits."], dealResults);
    empty.concentration = conc;
    return empty;
  }

  const feeBlocked = passing
    .map((row) => metricsByCode.get(row.input.code))
    .find((metrics) => metrics != null && metrics.feeAnnualCents == null);
  const feeReason = feeBlocked?.gap ?? FEE_NEEDED;
  const otherGap = passing.map((row) => metricsByCode.get(row.input.code)?.gap).find((gap) => gap && gap !== feeReason) ?? null;

  let feeAccruedUnpaid = 0n;
  let lpEquity = 0n;
  let rcpEquity = 0n;
  let equityRequired = 0n;
  let haveEquity = false;
  const hold = Math.max(...passing.map((row) => metricsByCode.get(row.input.code)?.holdYears ?? 1));
  const yearLp = Array.from({ length: hold }, () => 0n);
  const yearLpOps = Array.from({ length: hold }, () => 0n);
  const yearRcp = Array.from({ length: hold }, () => 0n);
  const yearRcpOps = Array.from({ length: hold }, () => 0n);
  const yearFee = Array.from({ length: hold }, () => 0n);

  const proformaDeals: DealProformaInput[] = [];
  for (const row of passing) {
    const metrics = metricsByCode.get(row.input.code)!;
    feeAccruedUnpaid += metrics.feeAccruedUnpaidCents;
    lpEquity += metrics.lpEquityCents;
    rcpEquity += metrics.rcpEquityCents;
    if (row.input.equityRequiredCents != null) {
      equityRequired += row.input.equityRequiredCents;
      haveEquity = true;
    }
    for (const year of metrics.years) {
      const index = year.year - 1;
      if (index < 0 || index >= hold) continue;
      yearLp[index] = (yearLp[index] ?? 0n) + year.lpCents;
      yearLpOps[index] = (yearLpOps[index] ?? 0n) + year.lpOperatingCents;
      yearRcp[index] = (yearRcp[index] ?? 0n) + year.rcpCents;
      yearRcpOps[index] = (yearRcpOps[index] ?? 0n) + year.rcpOperatingCents;
      yearFee[index] = (yearFee[index] ?? 0n) + year.feePaidCents;
    }
    for (const note of dealCashNotes(metrics.notes)) {
      const line = `${row.input.code}: ${note}`;
      if (!notes.includes(line)) notes.push(line);
    }
    proformaDeals.push({
      config: row.input.returns.config,
      lpContributedCents: row.input.returns.lpContributedCents,
      unreturnedCapitalCents: row.input.returns.unreturnedCapitalCents,
      unpaidPrefCents: row.input.returns.unpaidPrefCents,
      prefPaidToDateCents: row.input.returns.prefPaidToDateCents,
      holdYears: opts.assumptions.holdYears,
      year1CfadsCents: row.input.returns.year1CfadsCents,
      cfadsGrowthBps: opts.assumptions.growthBps,
      exitEquityProceedsCents: metrics.exitEquityProceedsCents,
      europeanPromoteOpen: row.input.returns.europeanPromoteOpen,
      operationsDeductionCents: metrics.feeAnnualCents ?? 0n,
      debtServiceCents: row.input.returns.annualDebtServiceCents ?? 0n,
      entityCode: row.input.code,
      entityName: row.input.name,
    });
  }
  const feeIncome = yearFee[0] ?? 0n;

  let rcpByYear = yearRcp;
  const prefCapital = opts.assumptions.opcoPrefCapitalCents;
  const prefRate = opts.assumptions.opcoPrefRateBps;
  if (prefRate != null && prefRate > 0 && prefCapital != null && prefCapital > 0n && !feeBlocked) {
    const platform: OpCoPlatformPrefs = {
      prefRateBps: prefRate,
      lpContributedCents: prefCapital,
      lpSplitBps: opts.assumptions.opcoLpSplitBps,
      gpSplitBps: opts.assumptions.opcoGpSplitBps,
    };
    const rolled = runOpCoProforma({ deals: proformaDeals, platform });
    rcpByYear = rolled.years.map((row) => row.opcoGpCents);
    notes.push("Optional OpCo pref is modeled on RCP cash after each deal waterfall.");
  } else if (feeBlocked && (prefRate != null || prefCapital != null)) {
    notes.push(`OpCo pref is not modeled because ${feeReason}.`);
  } else if (prefRate != null || prefCapital != null) {
    notes.push("OpCo pref is blank until both a rate and platform capital are typed.");
  }

  const years: ModelYear[] = feeBlocked
    ? Array.from({ length: Math.max(hold, opts.assumptions.holdYears, 1) }, (_, index) => ({ year: index + 1, rcpCents: null, lpCents: null, feeIncomeCents: null }))
    : rcpByYear.map((rcp, index) => ({
        year: index + 1,
        rcpCents: rcp,
        lpCents: yearLp[index] ?? 0n,
        feeIncomeCents: yearFee[index] ?? 0n,
      }));

  const includedFacts = passing.map((row) => row.input);
  const projection: ModelProjection = {
    label: PROJECTION_LABEL,
    notes: Array.from(new Set(notes)),
    years,
    feeIncomeCents: feeBlocked ? null : feeIncome,
    feeAccruedUnpaidCents: feeBlocked ? null : feeAccruedUnpaid,
    gaCoverageBps: null,
    gaGap: null,
    rcpEquityCents: feeBlocked ? null : rcpEquity,
    rcpCashOnCashBps: null,
    rcpAvgCashOnCashBps: null,
    rcpIrrBps: null,
    rcpIrrNote: null,
    rcpEquityMultipleBps: null,
    rcpMultipleNote: null,
    rcpGap: feeBlocked ? feeReason : null,
    cashGap: feeBlocked ? feeReason : null,
    equityRequiredCents: haveEquity ? equityRequired : null,
    lpNetIrrBps: null,
    lpIrrNote: null,
    lpYear1YieldBps: null,
    lpAvgYieldBps: null,
    lpIrrMinBps: null,
    lpIrrMaxBps: null,
    lpIrrGapDeals: [],
    noLpEquityDeals: [],
    lpGap: feeBlocked ? feeReason : otherGap,
    dscrBps: portfolioRatio(includedFacts, "dscr"),
    debtYieldBps: portfolioRatio(includedFacts, "debtYield"),
    concentration: conc,
    deals: dealResults,
  };

  if (feeBlocked) {
    projection.gaGap = feeReason;
    return projection;
  }

  if (opts.gaBudgetCents == null) projection.gaGap = GA_BUDGET_NEEDED;
  else if (opts.gaBudgetCents === 0n) projection.gaGap = "G&A budget is zero";
  else projection.gaCoverageBps = Number((feeIncome * 10_000n) / opts.gaBudgetCents);

  const noLpEquity = passing.filter((row) => (metricsByCode.get(row.input.code)?.lpEquityCents ?? 0n) <= 0n);
  const gapped = passing.filter((row) => {
    const metrics = metricsByCode.get(row.input.code);
    return Boolean(metrics?.exitGap && metrics.lpEquityCents > 0n);
  });
  projection.lpIrrGapDeals = gapped.map((row) => row.input.code);
  projection.noLpEquityDeals = noLpEquity.map((row) => row.input.code);
  if (projection.noLpEquityDeals.length) {
    const line = `no LP equity: ${projection.noLpEquityDeals.join(", ")}`;
    if (!projection.notes.includes(line)) projection.notes.push(line);
  }
  const exitNote = gapped.length ? exitValueNeededFor(gapped.length) : null;
  if (lpEquity > 0n) {
    if (exitNote) projection.lpIrrNote = exitNote;
    else {
      const lpCash = years.reduce((sum, row) => sum + (row.lpCents ?? 0n), 0n);
      if (lpCash <= 0n) {
        projection.lpNetIrrBps = -10_000;
        projection.lpIrrNote = NO_CASH_RETURNED_TO_LP;
      } else {
        const flows: IrrCashFlow[] = [{ amount: -Number(lpEquity), tYears: 0 }, ...years.map((row) => ({ amount: Number(row.lpCents ?? 0n), tYears: row.year }))];
        const irr = solveIrr(flows);
        projection.lpNetIrrBps = rateToBps(irr.rate);
        if (irr.reason && projection.lpNetIrrBps == null) projection.lpIrrNote = IRR_NOT_AVAILABLE;
      }
    }
    const n = BigInt(years.length || 1);
    const ops = yearLpOps.reduce((sum, value) => sum + value, 0n);
    projection.lpYear1YieldBps = yieldBps(yearLpOps[0] ?? 0n, lpEquity);
    projection.lpAvgYieldBps = yieldBps(ops / n, lpEquity);
    projection.lpGap = null;
  } else {
    projection.lpGap = "LP equity is not on file";
  }

  const dealIrrs = passing
    .map((row) => metricsByCode.get(row.input.code)?.lpNetIrrBps)
    .filter((value): value is number => value != null);
  if (dealIrrs.length) {
    projection.lpIrrMinBps = Math.min(...dealIrrs);
    projection.lpIrrMaxBps = Math.max(...dealIrrs);
  }

  if (rcpEquity > 0n) {
    const n = BigInt(years.length || 1);
    const ops = yearRcpOps.reduce((sum, value) => sum + value, 0n);
    projection.rcpCashOnCashBps = yieldBps(yearRcpOps[0] ?? 0n, rcpEquity);
    projection.rcpAvgCashOnCashBps = yieldBps(ops / n, rcpEquity);
    if (exitNote) {
      projection.rcpIrrNote = exitNote;
      projection.rcpMultipleNote = exitNote;
    } else {
      const total = years.reduce((sum, row) => sum + (row.rcpCents ?? 0n), 0n);
      if (total <= 0n) {
        projection.rcpIrrBps = -10_000;
        projection.rcpIrrNote = NO_CASH_RETURNED_TO_LP;
        projection.rcpEquityMultipleBps = yieldBps(total, rcpEquity);
      } else {
        const flows: IrrCashFlow[] = [{ amount: -Number(rcpEquity), tYears: 0 }, ...years.map((row) => ({ amount: Number(row.rcpCents ?? 0n), tYears: row.year }))];
        const irr = solveIrr(flows);
        projection.rcpIrrBps = rateToBps(irr.rate);
        if (irr.reason && projection.rcpIrrBps == null) projection.rcpIrrNote = IRR_NOT_AVAILABLE;
        projection.rcpEquityMultipleBps = yieldBps(total, rcpEquity);
      }
    }
  } else {
    projection.rcpGap = "RCP equity is zero";
  }

  for (const note of [projection.lpIrrNote, projection.rcpIrrNote]) {
    if (note && !projection.notes.includes(note)) projection.notes.push(note);
  }

  return projection;
}
