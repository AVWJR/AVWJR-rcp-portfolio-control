import type { Criterion } from "@/lib/library/criteria";
import type { ModelAssumptions, ModelProjection } from "./project";
import type { ModelKind } from "./membership";

export type ModelView = {
  id: string;
  name: string;
  kind: ModelKind;
  label: string;
  assumptions: {
    holdYears: number;
    growthPercent: number;
    exitCapPercent: number | null;
    opcoPrefPercent: number | null;
    opcoPrefCapitalCents: number | null;
  };
  criteria: Criterion[];
  notes: string[];
  years: { year: number; rcpCents: number; lpCents: number; feeIncomeCents: number }[];
  feeIncomeCents: number | null;
  gaCoverageBps: number | null;
  gaGap: string | null;
  rcpEquityCents: number | null;
  rcpCashOnCashBps: number | null;
  rcpAvgCashOnCashBps: number | null;
  rcpIrrBps: number | null;
  rcpEquityMultipleBps: number | null;
  rcpGap: string | null;
  equityRequiredCents: number | null;
  lpNetIrrBps: number | null;
  lpYear1YieldBps: number | null;
  lpAvgYieldBps: number | null;
  lpIrrMinBps: number | null;
  lpIrrMaxBps: number | null;
  lpGap: string | null;
  dscrBps: number | null;
  debtYieldBps: number | null;
  concentration: { dimension: string; label: string; equityCents: number; shareBps: number; breached: boolean }[];
  deals: {
    code: string;
    name: string;
    dealStatus: string;
    optimizerEligible: boolean;
    flag: string | null;
    stale: string;
    excluded: boolean;
    exclusions: string[];
    gap: string | null;
    lpNetIrrBps: number | null;
    lpYear1YieldBps: number | null;
    lpAvgYieldBps: number | null;
  }[];
};

function num(value: bigint | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

export function toModelView(input: {
  id: string;
  name: string;
  kind: ModelKind;
  assumptions: ModelAssumptions;
  criteria: Criterion[];
  projection: ModelProjection;
}): ModelView {
  const assumptions = input.assumptions;
  const projection = input.projection;
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    label: projection.label,
    assumptions: {
      holdYears: assumptions.holdYears,
      growthPercent: assumptions.growthBps / 100,
      exitCapPercent: assumptions.exitCapRateBps == null ? null : assumptions.exitCapRateBps / 100,
      opcoPrefPercent: assumptions.opcoPrefRateBps == null ? null : assumptions.opcoPrefRateBps / 100,
      opcoPrefCapitalCents: num(assumptions.opcoPrefCapitalCents),
    },
    criteria: input.criteria,
    notes: projection.notes,
    years: projection.years.map((row) => ({
      year: row.year,
      rcpCents: Number(row.rcpCents),
      lpCents: Number(row.lpCents),
      feeIncomeCents: Number(row.feeIncomeCents),
    })),
    feeIncomeCents: num(projection.feeIncomeCents),
    gaCoverageBps: projection.gaCoverageBps,
    gaGap: projection.gaGap,
    rcpEquityCents: num(projection.rcpEquityCents),
    rcpCashOnCashBps: projection.rcpCashOnCashBps,
    rcpAvgCashOnCashBps: projection.rcpAvgCashOnCashBps,
    rcpIrrBps: projection.rcpIrrBps,
    rcpEquityMultipleBps: projection.rcpEquityMultipleBps,
    rcpGap: projection.rcpGap,
    equityRequiredCents: num(projection.equityRequiredCents),
    lpNetIrrBps: projection.lpNetIrrBps,
    lpYear1YieldBps: projection.lpYear1YieldBps,
    lpAvgYieldBps: projection.lpAvgYieldBps,
    lpIrrMinBps: projection.lpIrrMinBps,
    lpIrrMaxBps: projection.lpIrrMaxBps,
    lpGap: projection.lpGap,
    dscrBps: projection.dscrBps,
    debtYieldBps: projection.debtYieldBps,
    concentration: projection.concentration.map((row) => ({
      dimension: row.dimension,
      label: row.label,
      equityCents: Number(row.equityCents),
      shareBps: row.shareBps,
      breached: row.breached,
    })),
    deals: projection.deals.map((deal) => ({
      code: deal.code,
      name: deal.name,
      dealStatus: deal.dealStatus,
      optimizerEligible: deal.optimizerEligible,
      flag: deal.flag,
      stale: deal.stale,
      excluded: deal.excluded,
      exclusions: deal.exclusions,
      gap: deal.gap,
      lpNetIrrBps: deal.metrics?.lpNetIrrBps ?? null,
      lpYear1YieldBps: deal.metrics?.lpYear1CashYieldBps ?? null,
      lpAvgYieldBps: deal.metrics?.lpAvgCashYieldBps ?? null,
    })),
  };
}
